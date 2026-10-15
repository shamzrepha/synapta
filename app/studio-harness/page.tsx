"use client";
// TEMPORARY visual test harness — not committed
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Viewer3D } from "@/components/studio/viewer3d";
import { CircuitBench } from "@/components/studio/circuit-bench";
import { MechPanel } from "@/components/studio/mech-panel";
import { TEMPLATES, templateSolution } from "@/lib/studio/templates";
import { resolveParts } from "@/lib/studio/spec";
import { Netlist, evaluateOutputs, type OutputState } from "@/lib/studio/circuit/netlist";
import { BoardRuntime, circuitReader } from "@/lib/studio/circuit/runtime";

export default function Harness() {
  const classair = useMemo(() => templateSolution(TEMPLATES.find((t) => t.id === "classair")!), []);
  const traffic = useMemo(() => templateSolution(TEMPLATES.find((t) => t.id === "traffic-light")!), []);
  const gear = useMemo(() => templateSolution(TEMPLATES.find((t) => t.id === "gear-lift")!), []);
  const classParts = useMemo(() => resolveParts(classair), [classair]);
  const [mech, setMech] = useState(gear.mechanism!);
  const [ms, setMs] = useState({ inputAngle: 0, loadHeight: 0 });
  const [outs, setOuts] = useState<Record<string, OutputState>>({});
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const rt = new BoardRuntime(traffic.code || "", circuitReader(traffic.circuit!, { pressed: new Set(), values: {} }));
    let last = performance.now();
    const nl = new Netlist(traffic.circuit!);
    const f = (now: number) => {
      const dt = Math.min(100, now - last) * 4; // 4x speed
      last = now;
      rt.advance(rt.now + dt);
      setOuts(evaluateOutputs(nl, rt.pins));
      setT(Math.round(rt.now));
      raf.current = requestAnimationFrame(f);
    };
    raf.current = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf.current);
  }, [traffic.code, traffic.circuit]);
  return (
    <div style={{ padding: 16, background: "#fff" }}>
      <p id="clock">t={t}</p>
      <div id="bench" style={{ maxWidth: 900 }}>
        <CircuitBench circuit={traffic.circuit!} onChange={() => {}} outputs={outs} running pressed={new Set()} onPress={() => {}} sensorValues={{}} onSensor={() => {}} />
      </div>
      <p id="leds">{JSON.stringify(Object.fromEntries(Object.entries(outs).filter(([k]) => ["red", "amber", "green"].includes(k)).map(([k, v]) => [k, v.on])))}</p>
      <Viewer3D parts={classParts} explode={0.55} selectedId="fan" onSelect={() => {}} className="h-[420px] w-full" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Viewer3D parts={[]} mechanism={mech} explode={0} selectedId={null} onSelect={() => {}} mechState={ms} className="h-[420px] w-full" />
        <MechPanel mechanism={mech} onChange={setMech} onAnimate={setMs} />
      </div>
    </div>
  );
}
