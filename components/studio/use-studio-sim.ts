"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DriveSim } from "@/lib/studio/drive/physics";
import { JointRig } from "@/lib/studio/twin/joints";
import { resolveTrack } from "@/lib/studio/drive/track";
import { emptyBlockly, programToBlockly } from "@/lib/studio/blockly/convert";
import { sceneParts, sceneWires } from "@/lib/studio/circuit/to3d";
import { analyzeMechanism } from "@/lib/studio/mech/gears";
import { playLift } from "@/lib/studio/mech/playback";
import type { DesignSpec } from "@/lib/studio/spec";
import { Netlist, evaluateOutputs, type OutputState } from "@/lib/studio/circuit/netlist";
import { BoardRuntime, circuitReader, runBehaviorTest, type TestResult } from "@/lib/studio/circuit/runtime";
import { checkCircuit, nextGaps } from "@/lib/studio/circuit/checker";

export interface UseStudioSimOptions {
  onTestsDone?: (results: TestResult[]) => void;
}

/**
 * Shared client runtime hook for interactive SunRoot Studio designs: drives BoardRuntime,
 * Netlist, 3D parts/wires, JointRig, DriveSim robot physics, and mechanism playback in one RAF loop.
 */
export function useStudioSim(shown: DesignSpec | null, opts: UseStudioSimOptions = {}) {
  const [mechState, setMechState] = useState({ inputAngle: 0, loadHeight: 0 });
  const [drive, setDrive] = useState<DriveSim | null>(null);
  const [rig, setRig] = useState<JointRig | null>(null);
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<Record<string, OutputState>>({});
  const [serial, setSerial] = useState<string>("");
  const [runError, setRunError] = useState<string | null>(null);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [sensorValues, setSensorValues] = useState<Record<string, number>>({});
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const typesRef = useRef<Record<string, string>>({});
  const runningRef = useRef(false);
  const mechStopRef = useRef<(() => void) | null>(null);
  const inputsRef = useRef({ pressed: new Set<string>(), values: {} as Record<string, number> });
  const rafRef = useRef(0);
  const onTestsDoneRef = useRef(opts.onTestsDone);

  useEffect(() => {
    onTestsDoneRef.current = opts.onTestsDone;
  }, [opts.onTestsDone]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const parts3d = useMemo(() => (shown ? sceneParts(shown) : []), [shown]);
  const wires3d = useMemo(() => (shown ? sceneWires(shown) : []), [shown]);
  const blocklyState = useMemo<object>(() => {
    if (shown?.blockly && shown.blockly.code === shown.code) return shown.blockly.state;
    if (shown?.blocks) return programToBlockly(shown.blocks);
    return emptyBlockly();
  }, [shown]);

  const idleDrive = useMemo(() => (shown?.robot && shown.world ? new DriveSim(shown.robot, resolveTrack(shown.world)) : null), [shown]);
  const idleRig = useMemo(() => (shown && shown.joints.length ? new JointRig(shown.joints) : null), [shown]);
  const activeRig = rig && shown && rig.joints === shown.joints ? rig : idleRig;
  const activeDrive = drive && shown?.robot === drive.robot ? drive : idleDrive;

  const links = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of shown?.circuit?.parts || []) out[p.id] = p.type;
    return out;
  }, [shown]);

  useEffect(() => {
    typesRef.current = links;
  }, [links]);

  const gaps = useMemo(() => (shown?.circuit ? nextGaps(shown.circuit, shown.code || "") : []), [shown]);
  const issues = useMemo(() => (shown?.circuit ? checkCircuit(shown.circuit, shown.code || "") : []), [shown]);

  const stopSim = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    mechStopRef.current?.();
    mechStopRef.current = null;
    setRunning(false);
  }, []);

  const resetSimState = useCallback(() => {
    stopSim();
    inputsRef.current = { pressed: new Set(), values: {} };
    setPressed(new Set());
    setSensorValues({});
    setOutputs({});
    setSerial("");
    setRunError(null);
    setTestResults([]);
    setDrive(null);
    setRig(null);
    setMechState({ inputAngle: 0, loadHeight: 0 });
  }, [stopSim]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      mechStopRef.current?.();
    };
  }, []);

  const startSim = useCallback(() => {
    if (!shown?.circuit) return;
    stopSim();
    const circuit = shown.circuit;
    inputsRef.current = { pressed: new Set(), values: { ...inputsRef.current.values } };
    setPressed(new Set());
    const hasBoard = circuit.parts.some((p) => p.type === "board");
    const rt = new BoardRuntime(hasBoard ? shown.code || "" : "", circuitReader(circuit, inputsRef.current));
    setSerial("");
    setRunError(rt.error);
    if (rt.error) return;
    setRunning(true);
    let last = performance.now();
    let printed = 0;
    let lastKey = "";
    let nl = new Netlist(circuit);
    const robot = shown.robot;
    const sim = robot && shown.world ? new DriveSim(robot, resolveTrack(shown.world)) : null;
    setDrive(sim);
    const jr = shown.joints.length ? new JointRig(shown.joints) : null;
    setRig(jr);
    const mech = shown.mechanism;
    const radPerMetre = mech ? analyzeMechanism(mech).radPerMetre : 0;
    let shaft = 0;
    let lastOutsKey = "";
    let lastMechPaint = 0;
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (sim && robot) for (const sn of robot.sensors) inputsRef.current.values[sn.id] = sim.read(sn);
      rt.advance(rt.now + dt, 150_000);
      const key = Array.from(inputsRef.current.pressed).sort().join(",");
      if (key !== lastKey) {
        lastKey = key;
        nl = new Netlist(circuit, inputsRef.current.pressed);
      }
      const outs = evaluateOutputs(nl, rt.pins);
      const outsKey = JSON.stringify(outs);
      if (outsKey !== lastOutsKey) {
        lastOutsKey = outsKey;
        setOutputs(outs);
      }
      if (sim && robot) {
        let rem = dt / 1000;
        while (rem > 1e-6) {
          const h = Math.min(0.02, rem);
          sim.step(h, outs[robot.left], outs[robot.right]);
          rem -= h;
        }
      }
      if (jr) {
        jr.step(dt / 1000, outs);
        if (jr.applyTriggers(shown.triggers, inputsRef.current)) setPressed(new Set(inputsRef.current.pressed));
      }
      if (mech) {
        const m = Object.entries(outs).find(([pid, o]) => typesRef.current[pid] === "dc_motor" && o.on)?.[1];
        if (m) {
          shaft += (m.direction || 1) * (0.5 + m.level * 9) * (dt / 1000);
          const lift = radPerMetre > 0 ? Math.max(0, Math.min(mech.liftHeight, shaft / radPerMetre)) : 0;
          if (now - lastMechPaint > 33) {
            lastMechPaint = now;
            setMechState({ inputAngle: shaft, loadHeight: lift });
          }
        }
      }
      if (rt.serial.length > printed) {
        const add = rt.serial.slice(printed).map((s) => s.text).join("");
        printed = rt.serial.length;
        setSerial((s) => (s + add).slice(-4000));
      }
      if (rt.error) {
        setRunError(rt.error);
        setRunning(false);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [shown, stopSim]);

  /** One Run for everything: the circuit + code (which drive the 3D parts and any mechanism), or just the gear rig. */
  const runAll = useCallback(() => {
    if (!shown) return;
    if (shown.circuit) {
      startSim();
      return;
    }
    if (shown.mechanism) {
      stopSim();
      setRunning(true);
      mechStopRef.current = playLift(shown.mechanism, setMechState, () => setRunning(false));
    }
  }, [shown, startSim, stopSim]);

  /** Buttons are momentary; switches latch. Used by the bench and by clicking 3D parts. */
  const press = useCallback(
    (pid: string, down: boolean) => {
      const isSwitch = typesRef.current[pid] === "switch";
      if (isSwitch && !down) return;
      if (!runningRef.current && shown?.circuit && down) startSim();
      const next = new Set(inputsRef.current.pressed);
      if (isSwitch) {
        if (next.has(pid)) next.delete(pid);
        else next.add(pid);
      } else if (down) next.add(pid);
      else next.delete(pid);
      inputsRef.current.pressed = next;
      setPressed(next);
    },
    [shown, startSim]
  );

  const setSensor = useCallback((pid: string, v: number) => {
    inputsRef.current.values[pid] = v;
    setSensorValues((s) => ({ ...s, [pid]: v }));
  }, []);

  const runTests = useCallback(() => {
    if (!shown?.circuit) return [];
    const results = shown.tests.map((t) => runBehaviorTest(shown.circuit!, shown.code || "", t));
    setTestResults(results);
    onTestsDoneRef.current?.(results);
    return results;
  }, [shown]);

  return {
    mechState,
    setMechState,
    running,
    outputs,
    liveOutputs: running ? outputs : {},
    serial,
    runError,
    pressed,
    sensorValues,
    setSensor,
    testResults,
    setTestResults,
    inputsRef,
    parts3d,
    wires3d,
    blocklyState,
    activeRig,
    activeDrive,
    links,
    gaps,
    issues,
    stopSim,
    startSim,
    runAll,
    press,
    runTests,
    resetSimState,
  };
}
