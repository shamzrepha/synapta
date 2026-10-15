"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Plus, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyzeMechanism, simulateLift, type SimResult } from "@/lib/studio/mech/gears";
import type { Mechanism } from "@/lib/studio/spec";
import { cn } from "@/lib/utils";

/**
 * Edit a gear-train rig and test it with gravity. Changes show their physics instantly (ratio,
 * torque needed vs available, best ratio); "Run test" plays the simulated lift in the 3D view.
 */
interface Props {
  mechanism: Mechanism;
  onChange: (m: Mechanism) => void;
  readOnly?: boolean;
  onAnimate: (state: { inputAngle: number; loadHeight: number }) => void;
  onResult?: (r: SimResult) => void;
}

function Num({ label, value, onChange, step = 1, min, max, unit, disabled }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-slate-500">
      {label}
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(min !== undefined || max !== undefined ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)) : v);
          }}
          className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-100"
        />
        {unit && <span className="text-slate-400 font-normal">{unit}</span>}
      </span>
    </label>
  );
}

function Chart({ r, playT }: { r: SimResult; playT: number | null }) {
  const W = 320;
  const H = 120;
  const tMax = Math.max(r.samples[r.samples.length - 1]?.t || 1, 0.1);
  const hMax = Math.max(r.liftHeight || 1, ...r.samples.map((s) => s.h));
  const pts = r.samples.map((s) => `${(s.t / tMax) * W},${H - (s.h / hMax) * H}`).join(" ");
  return (
    <svg viewBox={`-30 -8 ${W + 40} ${H + 26}`} className="w-full h-auto" role="img" aria-label="Load height over time">
      <line x1={0} y1={H} x2={W} y2={H} stroke="#94a3b8" />
      <line x1={0} y1={0} x2={0} y2={H} stroke="#94a3b8" />
      <line x1={0} y1={H - (r.liftHeight / hMax) * H} x2={W} y2={H - (r.liftHeight / hMax) * H} stroke="#22c55e" strokeDasharray="4 4" />
      <polyline points={pts} fill="none" stroke="#14b8a6" strokeWidth={2.5} />
      {playT !== null && <line x1={(playT / tMax) * W} y1={0} x2={(playT / tMax) * W} y2={H} stroke="#f59e0b" />}
      <text x={-4} y={4} textAnchor="end" fontSize={9} fill="#64748b">{hMax.toFixed(1)} m</text>
      <text x={-4} y={H} textAnchor="end" fontSize={9} fill="#64748b">0</text>
      <text x={W} y={H + 14} textAnchor="end" fontSize={9} fill="#64748b">{tMax.toFixed(1)} s</text>
      <text x={W / 2} y={H + 14} textAnchor="middle" fontSize={9} fill="#64748b">time</text>
    </svg>
  );
}

export function MechPanel({ mechanism: m, onChange, readOnly, onAnimate, onResult }: Props) {
  const a = useMemo(() => analyzeMechanism(m), [m]);
  const [result, setResult] = useState<SimResult | null>(null);
  const [playT, setPlayT] = useState<number | null>(null);
  const raf = useRef(0);
  const set = (patch: Partial<Mechanism>) => onChange({ ...m, ...patch });
  const setInput = (patch: Partial<Mechanism["input"]>) => set({ input: { ...m.input, ...patch } });

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const run = () => {
    cancelAnimationFrame(raf.current);
    const r = simulateLift(m);
    setResult(r);
    onResult?.(r);
    const samples = r.samples;
    const end = samples[samples.length - 1]?.t || 0;
    // Play back in real time (capped at 12 s so slow designs don't drag)
    const speed = Math.max(1, end / 12);
    const start = performance.now();
    let angle = 0;
    let lastT = 0;
    let i = 0;
    const tick = (now: number) => {
      const t = Math.min(end, ((now - start) / 1000) * speed);
      while (i + 1 < samples.length && samples[i + 1].t <= t) i++;
      const s = samples[i];
      const next = samples[Math.min(i + 1, samples.length - 1)];
      const f = next.t > s.t ? (t - s.t) / (next.t - s.t) : 0;
      const h = s.h + (next.h - s.h) * f;
      const rpm = s.inputRpm + (next.inputRpm - s.inputRpm) * f;
      angle += ((rpm * 2 * Math.PI) / 60) * (t - lastT) * (m.input.kind === "motor" ? 0.05 : 1);
      lastT = t;
      onAnimate({ inputAngle: angle, loadHeight: h });
      setPlayT(t);
      if (t < end) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const reset = () => {
    cancelAnimationFrame(raf.current);
    setPlayT(null);
    onAnimate({ inputAngle: 0, loadHeight: 0 });
  };

  const ok = a.canLift;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
        <label className="col-span-2 flex items-center gap-2 text-xs font-semibold">
          Input
          <select value={m.input.kind} disabled={readOnly} onChange={(e) => setInput({ kind: e.target.value as "motor" | "crank" })} className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2">
            <option value="motor">Electric motor</option>
            <option value="crank">Hand crank (person)</option>
          </select>
        </label>
        {m.input.kind === "motor" ? (
          <>
            <Num label="Stall torque" unit="N·m" step={0.01} min={0.001} max={1000} value={m.input.stallTorque} onChange={(v) => setInput({ stallTorque: v })} disabled={readOnly} />
            <Num label="No-load speed" unit="rpm" step={100} min={10} max={30000} value={m.input.freeRpm} onChange={(v) => setInput({ freeRpm: v })} disabled={readOnly} />
          </>
        ) : (
          <>
            <Num label="Push force" unit="N" min={1} max={2000} value={m.input.force} onChange={(v) => setInput({ force: v })} disabled={readOnly} />
            <Num label="Handle radius" unit="m" step={0.01} min={0.02} max={2} value={m.input.crankRadius} onChange={(v) => setInput({ crankRadius: v })} disabled={readOnly} />
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold">Gear stages <span className="font-normal text-slate-500">(module {m.module} mm)</span></p>
          {!readOnly && m.stages.length < 6 && (
            <button type="button" onClick={() => set({ stages: [...m.stages, { driverTeeth: 12, drivenTeeth: 36 }] })} className="flex items-center gap-1 text-xs font-semibold text-teal-600">
              <Plus className="h-3.5 w-3.5" /> Add stage
            </button>
          )}
        </div>
        {m.stages.map((s, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto_auto] items-end gap-2">
            <span className="text-xs font-bold text-slate-400 pb-2">#{i + 1}</span>
            <Num label="Driver teeth" min={6} max={200} value={s.driverTeeth} onChange={(v) => set({ stages: m.stages.map((x, j) => (j === i ? { ...x, driverTeeth: Math.round(v) } : x)) })} disabled={readOnly} />
            <Num label="Driven teeth" min={6} max={200} value={s.drivenTeeth} onChange={(v) => set({ stages: m.stages.map((x, j) => (j === i ? { ...x, drivenTeeth: Math.round(v) } : x)) })} disabled={readOnly} />
            <span className="text-xs font-mono pb-2">{(s.drivenTeeth / s.driverTeeth).toFixed(2)}:1</span>
            {!readOnly && (
              <button type="button" onClick={() => set({ stages: m.stages.filter((_, j) => j !== i) })} className="pb-2 text-slate-400 hover:text-rose-600" aria-label={`Remove stage ${i + 1}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
        <Num label="Load mass" unit="kg" step={0.5} min={0.01} max={10000} value={m.load.mass} onChange={(v) => set({ load: { mass: v } })} disabled={readOnly} />
        <Num label="Lift height" unit="m" step={0.1} min={0.05} max={100} value={m.liftHeight} onChange={(v) => set({ liftHeight: v })} disabled={readOnly} />
        <Num label="Drum radius" unit="m" step={0.005} min={0.002} max={1} value={m.drumRadius} onChange={(v) => set({ drumRadius: v })} disabled={readOnly} />
        <Num label="Pulley advantage" min={1} max={8} value={m.pulleyAdvantage} onChange={(v) => set({ pulleyAdvantage: Math.round(v) })} disabled={readOnly} />
        <Num label="Efficiency / stage" step={0.01} min={0.3} max={1} value={m.efficiencyPerStage} onChange={(v) => set({ efficiencyPerStage: v })} disabled={readOnly} />
        <Num label="Gear module" unit="mm" step={0.5} min={0.5} max={20} value={m.module} onChange={(v) => set({ module: v })} disabled={readOnly} />
      </div>

      <div className={cn("rounded-2xl p-3 text-sm space-y-1", ok ? "bg-emerald-500/10" : "bg-rose-500/10")}>
        <p className="font-bold">{ok ? "✅ Can lift the load" : "❌ Too weak — it will stall"}</p>
        <p>
          Total ratio <b>{a.ratio.toFixed(2)}:1</b> · efficiency {(a.efficiency * 100).toFixed(0)}%
        </p>
        <p>
          Torque needed <b>{a.holdTorque.toFixed(3)} N·m</b> vs available <b>{a.inputMaxTorque.toFixed(3)} N·m</b>
          {a.holdForce !== undefined && <> · push force needed <b>{a.holdForce.toFixed(1)} N</b></>}
        </p>
        <p>
          Steady lift speed {(a.steadySpeed * 100).toFixed(1)} cm/s · fastest ratio for this load ≈ <b>{a.optimalRatio.toFixed(1)}:1</b>
        </p>
        {a.warnings.map((w) => (
          <p key={w} className="text-amber-700 dark:text-amber-400 text-xs">⚠ {w}</p>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={run} className="flex-1">
          <Play className="h-4 w-4 mr-1" /> Run lift test
        </Button>
        <Button variant="outline" onClick={reset} aria-label="Reset">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
      {result && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
          <p className="text-sm font-semibold">{result.verdict}</p>
          {result.reached && <p className="text-xs text-slate-500">Score: <b className="text-teal-600">{result.score}</b> (faster lift = higher score)</p>}
          <Chart r={result} playT={playT} />
        </div>
      )}
    </div>
  );
}
