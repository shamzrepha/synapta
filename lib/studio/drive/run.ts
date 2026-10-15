import { Netlist, evaluateOutputs } from "../circuit/netlist";
import { BoardRuntime, circuitReader } from "../circuit/runtime";
import type { DesignSpec } from "../spec";
import { JointRig } from "../twin/joints";
import { DriveSim } from "./physics";
import { resolveTrack } from "./track";

export interface MachineResult {
  /** the robot in its world, when the design has one */
  drive: DriveSim | null;
  /** machine joints (gates, lifts, arms), when the design has them */
  rig: JointRig | null;
  error: string | null;
  seconds: number;
  /** values of each joint sampled every 0.1 s */
  jointLog: Array<{ t: number; values: Record<string, number> }>;
  serial: string[];
  /** the board's pin state at the end of the run */
  pins: BoardRuntime["pins"];
}

/**
 * Runs a whole design headless: the code on the simulated board, the circuit, the machine joints and
 * the robot's physics together — the same engine the live view uses, so tests, step checks and scoring
 * always agree with what you see.
 * `setup` can poke sensor values (e.g. an object at 15 cm) before and during the run.
 */
export function simulateMachine(spec: DesignSpec, seconds: number, opts: { dt?: number; onTick?: (t: number, inputs: { pressed: Set<string>; values: Record<string, number> }) => void } = {}): MachineResult {
  if (!spec.circuit) throw new Error("This design has no circuit to simulate.");
  const dt = opts.dt ?? 0.01;
  const drive = spec.robot && spec.world ? new DriveSim(spec.robot, resolveTrack(spec.world)) : null;
  const rig = spec.joints.length ? new JointRig(spec.joints) : null;
  const inputs = { pressed: new Set<string>(), values: {} as Record<string, number> };
  const rt = new BoardRuntime(spec.code || "", circuitReader(spec.circuit, inputs));
  let nl = new Netlist(spec.circuit, inputs.pressed);
  let key = "";
  const jointLog: MachineResult["jointLog"] = [];
  let nextLog = 0;
  for (let t = 0; t < seconds && !rt.error; t += dt) {
    opts.onTick?.(t, inputs);
    if (drive && spec.robot) for (const s of spec.robot.sensors) inputs.values[s.id] = drive.read(s);
    rig?.applyTriggers(spec.triggers, inputs);
    const k = Array.from(inputs.pressed).sort().join(",");
    if (k !== key) {
      key = k;
      nl = new Netlist(spec.circuit, inputs.pressed);
    }
    rt.advance(Math.round(t * 1000), 2_000_000);
    const outs = evaluateOutputs(nl, rt.pins);
    if (drive && spec.robot) drive.step(dt, outs[spec.robot.left], outs[spec.robot.right]);
    rig?.step(dt, outs);
    if (rig && t >= nextLog) {
      jointLog.push({ t, values: { ...rig.values } });
      nextLog += 0.1;
    }
  }
  return { drive, rig, error: rt.error, seconds, jointLog, serial: rt.serial.map((e) => e.text), pins: rt.pins };
}

export interface DriveResult {
  drive: DriveSim;
  error: string | null;
  seconds: number;
  /** fraction of the time the robot was on the line */
  onLineFraction: number;
  /** laps (or fraction of the path) completed */
  laps: number;
}

/** The robot's run on its track or arena. */
export function simulateDrive(spec: DesignSpec, seconds: number, dt = 0.01): DriveResult {
  if (!spec.circuit || !spec.robot || !spec.world) throw new Error("This design has no robot and world to simulate.");
  const r = simulateMachine(spec, seconds, { dt });
  const drive = r.drive!;
  return { drive, error: r.error, seconds, onLineFraction: drive.time ? drive.onLine / drive.time : 0, laps: drive.progress / drive.track.length };
}
