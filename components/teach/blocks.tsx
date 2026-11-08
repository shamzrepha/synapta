"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { clamp, fractionFacts, projectileAt, projectileSummary, round, sampleFunction, triangleSquares } from "@/lib/teach/math";
import { isBalanced, countSide, subscripts } from "@/lib/teach/chem";
import type { Block } from "@/lib/teach/script";

type Of<T extends Block["type"]> = Extract<Block, { type: T }>;

/** Reveals items one by one (1 immediately, then every `ms`) so an explanation builds up instead of appearing all at once. */
function useReveal(total: number, ms: number, resetKey: unknown) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const reset = setTimeout(() => setShown(1), 0);
    if (total <= 1) return () => clearTimeout(reset);
    const t = setInterval(() => setShown((s) => (s >= total ? s : s + 1)), ms);
    return () => {
      clearTimeout(reset);
      clearInterval(t);
    };
  }, [total, ms, resetKey]);
  return [shown, setShown] as const;
}

function Range({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold">
      <span className="w-24 shrink-0 text-slate-600 dark:text-slate-300">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-brand-600" />
      <span className="w-12 text-right font-mono tabular-nums">{round(value, 2)}</span>
    </label>
  );
}

export function TextBlock({ b, ms }: { b: Of<"text">; ms: number }) {
  const [shown] = useReveal(b.bullets.length, ms, b);
  return (
    <div className="space-y-3">
      {b.heading && <h3 className="text-xl md:text-2xl font-extrabold tracking-tight">{b.heading}</h3>}
      <ul className="space-y-2">
        {b.bullets.map((t, i) => (
          <li key={i} className={`flex gap-2 text-sm md:text-base transition-all duration-500 ${i < shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <MarkdownRenderer content={t} className="prose-p:my-0 text-sm md:text-base" localized />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EquationSteps({ b, ms }: { b: Of<"equation_steps">; ms: number }) {
  const [shown, setShown] = useReveal(b.steps.length, ms * 1.6, b);
  return (
    <div className="space-y-2">
      {b.steps.slice(0, shown).map((s, i) => (
        <div key={i} className={`rounded-xl border px-3 py-2 transition-all duration-500 ${i === shown - 1 ? "border-brand-500 bg-brand-500/5" : "border-slate-200 dark:border-slate-800"}`}>
          <MarkdownRenderer content={`$$${s.expr}$$`} className="prose-p:my-0" localized />
          {s.note && <p className="text-xs text-slate-500">{s.note}</p>}
        </div>
      ))}
      {shown < b.steps.length && (
        <button type="button" onClick={() => setShown((n) => n + 1)} className="text-xs font-semibold text-brand-700 dark:text-brand-300 underline">
          Show the next step
        </button>
      )}
    </div>
  );
}

export function TriangleBlock({ b }: { b: Of<"triangle"> }) {
  const [a, setA] = useState(b.a);
  const [bb, setBb] = useState(b.b);
  const { a2, b2, c, c2 } = triangleSquares(a, bb);
  const k = Math.min(30, 130 / Math.max(a, bb)); // px per unit: big for small triangles, still inside the picture for large ones
  const W = 440;
  const H = 360;
  // right angle at (ox, oy); leg a along the bottom to the right, leg b upwards
  const ox = 150;
  const oy = 270;
  const A = [ox + a * k, oy];
  const B = [ox, oy - bb * k];
  // the square on the hypotenuse, built outward (away from the right angle)
  const dx = A[0] - B[0];
  const dy = A[1] - B[1];
  const hyp = [A, [A[0] + dy, A[1] - dx], [B[0] + dy, B[1] - dx], B];
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Right triangle with legs ${a} and ${bb}; squares on each side have areas ${a2}, ${b2} and ${c2}`} className="w-full max-w-md mx-auto">
        <rect x={ox} y={oy} width={a * k} height={a * k} className="fill-brand-500/25 stroke-brand-600" />
        <rect x={ox - bb * k} y={oy - bb * k} width={bb * k} height={bb * k} className="fill-amber-500/25 stroke-amber-600" />
        <polygon points={hyp.map((p) => p.join(",")).join(" ")} className="fill-violet-500/25 stroke-violet-600" />
        <polygon points={`${ox},${oy} ${A[0]},${A[1]} ${B[0]},${B[1]}`} className="fill-white/60 dark:fill-slate-900/60 stroke-slate-700 dark:stroke-slate-200" strokeWidth={1.5} />
        <path d={`M ${ox + 10} ${oy} v -10 h -10`} fill="none" className="stroke-slate-700 dark:stroke-slate-200" />
        <text x={ox + (a * k) / 2} y={oy + (a * k) / 2 + 4} textAnchor="middle" className="fill-brand-700 dark:fill-brand-300 text-[11px] font-bold">a² = {a2}</text>
        <text x={ox - (bb * k) / 2} y={oy - (bb * k) / 2 + 4} textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-[11px] font-bold">b² = {b2}</text>
        <text x={(hyp[0][0] + hyp[2][0]) / 2} y={(hyp[0][1] + hyp[2][1]) / 2} textAnchor="middle" className="fill-violet-700 dark:fill-violet-300 text-[11px] font-bold">c² = {c2}</text>
      </svg>
      <p className="text-center font-mono text-sm">{a2} + {b2} = {c2} &nbsp;→&nbsp; c = {round(c, 2)}</p>
      <div className="space-y-1">
        <Range label="side a" min={1} max={12} value={a} onChange={setA} />
        <Range label="side b" min={1} max={12} value={bb} onChange={setBb} />
      </div>
    </div>
  );
}

export function GrapherBlock({ b }: { b: Of<"grapher"> }) {
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(b.sliders.map((s) => [s.key, s.value])));
  const pts = useMemo(() => sampleFunction(b.expr, vals, b.xMin, b.xMax), [b.expr, b.xMin, b.xMax, vals]);
  const ys = pts.map((p) => p.y).filter((y): y is number => y !== null);
  let yMin = ys.length ? Math.min(...ys) : -1;
  let yMax = ys.length ? Math.max(...ys) : 1;
  yMin = Math.max(yMin, -200);
  yMax = Math.min(yMax, 200);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.1;
  yMin -= pad;
  yMax += pad;
  const W = 360;
  const H = 240;
  const sx = (x: number) => ((x - b.xMin) / (b.xMax - b.xMin)) * W;
  const sy = (y: number) => H - ((clamp(y, yMin, yMax) - yMin) / (yMax - yMin)) * H;
  const segments: string[] = [];
  let cur: string[] = [];
  for (const p of pts) {
    if (p.y === null || p.y < yMin - (yMax - yMin) || p.y > yMax + (yMax - yMin)) {
      if (cur.length > 1) segments.push(cur.join(" "));
      cur = [];
    } else cur.push(`${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`);
  }
  if (cur.length > 1) segments.push(cur.join(" "));
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Graph of y = ${b.expr}`} className="w-full max-w-md mx-auto rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
        {b.xMin <= 0 && b.xMax >= 0 && <line x1={sx(0)} x2={sx(0)} y1={0} y2={H} className="stroke-slate-400" />}
        {yMin <= 0 && yMax >= 0 && <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} className="stroke-slate-400" />}
        {segments.map((s, i) => (
          <polyline key={i} points={s} fill="none" className="stroke-brand-600" strokeWidth={2.5} strokeLinejoin="round" />
        ))}
      </svg>
      <p className="text-center font-mono text-sm">y = {b.expr}</p>
      {b.caption && <p className="text-center text-xs text-slate-500">{b.caption}</p>}
      <div className="space-y-1">
        {b.sliders.map((s) => (
          <Range key={s.key} label={s.label || s.key} min={s.min} max={s.max} step={(s.max - s.min) / 100} value={vals[s.key]} onChange={(v) => setVals((o) => ({ ...o, [s.key]: v }))} />
        ))}
      </div>
    </div>
  );
}

export function MotionBlock({ b }: { b: Of<"motion"> }) {
  const [v0, setV0] = useState(b.v0);
  const [angle, setAngle] = useState(b.angle);
  const [g] = useState(b.g);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { flight, range, peak } = projectileSummary(v0, angle, g);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setT((prev) => {
        const nt = prev + dt;
        if (nt >= flight) {
          done = true;
          return flight;
        }
        return nt;
      });
      if (done) setPlaying(false);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, flight]);
  const W = 360;
  const H = 220;
  const scale = Math.min((W - 40) / Math.max(range, 1), (H - 40) / Math.max(peak, 1));
  const px = (x: number) => 20 + x * scale;
  const py = (y: number) => H - 20 - y * scale;
  const path = Array.from({ length: 41 }, (_, i) => {
    const p = projectileAt(v0, angle, g, (flight * i) / 40);
    return `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`;
  }).join(" ");
  const now = projectileAt(v0, angle, g, t);
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projectile launched at ${v0} metres per second at ${angle} degrees travels ${round(range, 1)} metres`} className="w-full max-w-md mx-auto rounded-xl bg-sky-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
        <line x1={0} x2={W} y1={H - 20} y2={H - 20} className="stroke-emerald-600" strokeWidth={3} />
        <polyline points={path} fill="none" className="stroke-slate-400" strokeDasharray="4 4" />
        <circle cx={px(now.x)} cy={py(Math.max(0, now.y))} r={7} className="fill-amber-500" />
      </svg>
      <p className="text-center text-xs font-mono">flight {round(flight, 2)} s · range {round(range, 1)} m · peak {round(peak, 1)} m</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { if (t >= flight) setT(0); setPlaying((p) => !p); }} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">{playing ? "Pause" : t >= flight ? "Replay" : "Launch"}</button>
        <input type="range" min={0} max={flight} step={flight / 200 || 0.01} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} aria-label="Time" className="flex-1 accent-brand-600" />
      </div>
      <div className="space-y-1">
        <Range label="speed (m/s)" min={5} max={60} value={v0} onChange={(v) => { setV0(v); setT(0); }} />
        <Range label="angle (°)" min={5} max={85} value={angle} onChange={(v) => { setAngle(v); setT(0); }} />
      </div>
    </div>
  );
}

export function FractionBlock({ b }: { b: Of<"fraction"> }) {
  const [den, setDen] = useState(b.den);
  const [num, setNum] = useState(Math.min(b.num, b.den));
  const n = Math.min(num, den);
  const f = fractionFacts(n, den);
  return (
    <div className="space-y-3">
      <div className="flex h-14 overflow-hidden rounded-xl border-2 border-slate-700 dark:border-slate-300" role="img" aria-label={`${n} out of ${den} equal parts shaded`}>
        {Array.from({ length: den }, (_, i) => (
          <div key={i} className={`flex-1 border-r last:border-r-0 border-slate-500/50 transition-colors duration-300 ${i < n ? "bg-brand-500" : "bg-transparent"}`} />
        ))}
      </div>
      <p className="text-center text-2xl font-extrabold">{n}/{den}</p>
      <p className="text-center text-xs font-mono">= {f.reduced} = {f.decimal} = {f.percent}%</p>
      <div className="space-y-1">
        <Range label="parts shaded" min={0} max={den} value={n} onChange={setNum} />
        <Range label="equal parts" min={1} max={20} value={den} onChange={(v) => { setDen(v); setNum((x) => Math.min(x, v)); }} />
      </div>
    </div>
  );
}

export function TimelineBlock({ b, ms }: { b: Of<"timeline">; ms: number }) {
  const [shown, setShown] = useReveal(b.items.length, ms * 1.6, b);
  return (
    <div className="space-y-3">
      <ol className="relative border-l-2 border-brand-500/40 ml-2 space-y-3">
        {b.items.map((it, i) => (
          <li key={i} className={`pl-4 transition-all duration-500 ${i < shown ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}>
            <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-brand-500" />
            <p className="font-bold text-sm">{it.label}</p>
            {it.detail && <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300">{it.detail}</p>}
          </li>
        ))}
      </ol>
      {shown < b.items.length && (
        <button type="button" onClick={() => setShown((n) => n + 1)} className="text-xs font-semibold text-brand-700 dark:text-brand-300 underline">
          Show the next one
        </button>
      )}
    </div>
  );
}

export function CompareBlock({ b }: { b: Of<"compare"> }) {
  const col = (side: Of<"compare">["left"], tone: string) => (
    <div className={`rounded-xl border p-3 space-y-1.5 ${tone}`}>
      <p className="font-bold text-sm">{side.title}</p>
      <ul className="space-y-1 text-xs md:text-sm">
        {side.points.map((p, i) => (
          <li key={i}>• {p}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {col(b.left, "border-brand-500/50 bg-brand-500/5")}
      {col(b.right, "border-amber-500/50 bg-amber-500/5")}
    </div>
  );
}

export function FigureBlock({ b, ms }: { b: Of<"figure">; ms: number }) {
  const [shown] = useReveal(b.parts.length, ms, b);
  const [broken, setBroken] = useState(false);
  return (
    <div className="space-y-3">
      {b.src && !broken ? (
        <figure className="space-y-1">
          {/* a real picture from Wikimedia Commons; plain <img> because the host is fixed and the licence line must stay visible */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.src.url} alt={b.caption || b.query} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="mx-auto max-h-72 w-auto max-w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white object-contain" />
          <figcaption className="text-center text-[11px] text-slate-500">
            {b.caption && <span className="block text-xs text-slate-700 dark:text-slate-200 font-semibold">{b.caption}</span>}
            <a href={b.src.page} target="_blank" rel="noopener noreferrer" className="underline">{b.src.author}, {b.src.license}, via Wikimedia Commons</a>
          </figcaption>
        </figure>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500">{b.caption || b.query} (no picture available right now)</p>
      )}
      {b.parts.length > 0 && (
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {b.parts.map((p, i) => (
            <li key={i} className={`flex gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs transition-all duration-500 ${i < shown ? "opacity-100" : "opacity-0"}`}>
              <span className="font-mono font-bold text-brand-600">{i + 1}</span>
              <span><b>{p.name}</b>{p.detail ? `: ${p.detail}` : ""}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function CheckBlock({ b }: { b: Of<"check"> }) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  return (
    <div className="space-y-3">
      <p className="font-bold text-sm md:text-base">{b.question}</p>
      <div className="space-y-2" role="group" aria-label="Answers">
        {b.options.map((o, i) => {
          const right = i === b.answer;
          return (
            <button
              key={i}
              type="button"
              disabled={done}
              onClick={() => setPicked(i)}
              className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition-colors ${done ? (right ? "border-emerald-500 bg-emerald-500/10" : i === picked ? "border-rose-500 bg-rose-500/10" : "border-slate-200 dark:border-slate-800 opacity-60") : "border-slate-300 dark:border-slate-700 hover:border-brand-500"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {done && (
        <p className={`text-sm font-semibold ${picked === b.answer ? "text-emerald-600" : "text-rose-600"}`} role="status">
          {picked === b.answer ? "Correct! " : "Not quite. "}
          <span className="font-normal text-slate-600 dark:text-slate-300">{b.explain}</span>
        </p>
      )}
      {done && (
        <button type="button" onClick={() => setPicked(null)} className="text-xs font-semibold text-brand-700 dark:text-brand-300 underline">Try again</button>
      )}
    </div>
  );
}

export function FlowBlock({ b, ms }: { b: Of<"flow">; ms: number }) {
  const [shown, setShown] = useReveal(b.steps.length, ms * 1.6, b);
  return (
    <div className="space-y-2">
      <ol className="space-y-1">
        {b.steps.map((st, i) => (
          <li key={i} className={`transition-all duration-500 ${i < shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
            <div className="flex items-start gap-3 rounded-xl border border-brand-500/40 bg-brand-500/5 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
              <div>
                <p className="font-bold text-sm">{st.label}</p>
                {st.detail && <p className="text-xs text-slate-600 dark:text-slate-300">{st.detail}</p>}
              </div>
            </div>
            {i < b.steps.length - 1 && <p className="text-center text-brand-500 leading-none" aria-hidden>↓</p>}
          </li>
        ))}
      </ol>
      {shown < b.steps.length && (
        <button type="button" onClick={() => setShown((n) => n + 1)} className="text-xs font-semibold text-brand-700 dark:text-brand-300 underline">Show the next step</button>
      )}
    </div>
  );
}

export function BalanceBlock({ b }: { b: Of<"balance"> }) {
  const [re, setRe] = useState(b.reactants.map(() => 1));
  const [pr, setPr] = useState(b.products.map(() => 1));
  const L = b.reactants.map((t, i) => ({ formula: t.formula, coef: re[i] }));
  const R = b.products.map((t, i) => ({ formula: t.formula, coef: pr[i] }));
  const ok = isBalanced(L, R);
  const a = countSide(L) || {};
  const c = countSide(R) || {};
  const els = [...new Set([...Object.keys(a), ...Object.keys(c)])];
  const stepper = (val: number, set: (n: number) => void, label: string) => (
    <span className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700">
      <button type="button" aria-label={`Less ${label}`} onClick={() => set(Math.max(1, val - 1))} className="h-8 w-7 text-base">−</button>
      <span className="w-6 text-center font-mono font-bold">{val}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => set(Math.min(12, val + 1))} className="h-8 w-7 text-base">+</button>
    </span>
  );
  const side = (items: typeof b.reactants, vals: number[], setVals: React.Dispatch<React.SetStateAction<number[]>>) =>
    items.map((t, i) => (
      <span key={i} className="inline-flex items-center gap-1.5">
        {i > 0 && <span className="text-slate-400">+</span>}
        {stepper(vals[i], (n) => setVals((o) => o.map((x, k) => (k === i ? n : x))), t.formula)}
        <span className="font-semibold text-base">{subscripts(t.formula)}</span>
      </span>
    ));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {side(b.reactants, re, setRe)}
        <span className="px-1 text-lg">→</span>
        {side(b.products, pr, setPr)}
      </div>
      <table className="mx-auto text-xs font-mono">
        <thead><tr className="text-slate-500"><th className="px-3 text-left">atom</th><th className="px-3">left</th><th className="px-3">right</th></tr></thead>
        <tbody>
          {els.map((el) => (
            <tr key={el} className={(a[el] || 0) === (c[el] || 0) ? "text-emerald-600" : "text-rose-600"}>
              <td className="px-3 font-bold">{el}</td><td className="px-3 text-center">{a[el] || 0}</td><td className="px-3 text-center">{c[el] || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`text-center text-sm font-bold ${ok ? "text-emerald-600" : "text-slate-500"}`} role="status">{ok ? "Balanced! Both sides have the same atoms." : "Change the numbers until every atom matches."}</p>
    </div>
  );
}

/** Draws one block. The blocks are the only things an AI lesson can show, so nothing the AI writes is ever executed. */
export function BlockView({ block, ms }: { block: Block; ms: number }) {
  switch (block.type) {
    case "text":
      return <TextBlock b={block} ms={ms} />;
    case "equation_steps":
      return <EquationSteps b={block} ms={ms} />;
    case "triangle":
      return <TriangleBlock b={block} />;
    case "grapher":
      return <GrapherBlock b={block} />;
    case "motion":
      return <MotionBlock b={block} />;
    case "fraction":
      return <FractionBlock b={block} />;
    case "timeline":
      return <TimelineBlock b={block} ms={ms} />;
    case "compare":
      return <CompareBlock b={block} />;
    case "figure":
      return <FigureBlock b={block} ms={ms} />;
    case "check":
      return <CheckBlock b={block} />;
    case "flow":
      return <FlowBlock b={block} ms={ms} />;
    case "balance":
      return <BalanceBlock b={block} />;
  }
}
