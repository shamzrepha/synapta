"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Plus, X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { GestureToggle, useGestureLock } from "./gesture-lock";
import { CATALOG, CATALOG_BY_TYPE, LED_COLORS, isButtonLike, type ComponentDef, type PinDef } from "@/lib/studio/circuit/catalog";
import type { OutputState } from "@/lib/studio/circuit/netlist";
import type { CircuitPart, Wire } from "@/lib/studio/spec";
import { cn } from "@/lib/utils";
import { PartArt } from "./part-art";

/**
 * Virtual breadboard bench. Build mode: drag parts, tap a pin then another pin to wire, tap a wire
 * or part to select/delete. Run mode: hold buttons, slide sensor values, watch outputs react.
 */
export interface CircuitValue {
  parts: CircuitPart[];
  wires: Wire[];
}

interface Props {
  circuit: CircuitValue;
  onChange: (c: CircuitValue) => void;
  outputs: Record<string, OutputState>;
  running: boolean;
  readOnly?: boolean;
  pressed: Set<string>;
  onPress: (id: string, down: boolean) => void;
  sensorValues: Record<string, number>;
  onSensor: (id: string, value: number) => void;
  highlight?: string[];
  /** fill the available box (fullscreen stage) instead of scrolling sideways */
  fit?: boolean;
}

const W = 900;
const H = 520;
const WIRE_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#111827", "#e5e7eb"];

function pinPos(p: CircuitPart, def: ComponentDef, pin: string) {
  const d = def.pins.find((x) => x.name === pin);
  if (!d) return { x: p.x, y: p.y };
  return { x: p.x + d.x * def.w, y: p.y + d.y * def.h };
}

function nextId(prefix: string, taken: Set<string>) {
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function pinTooltip(pin: PinDef, editable: boolean): string {
  const roleLabel =
    pin.role === "power"
      ? `power supply${pin.volts ? ` (${pin.volts} V)` : ""}`
      : pin.role === "ground"
        ? "ground reference (0 V)"
        : pin.role === "digital"
          ? `digital I/O${pin.pwm ? " + PWM (~)" : ""}`
          : pin.role === "analog"
            ? "analog input (0–5 V)"
            : pin.role === "signalIn"
              ? "signal input"
              : pin.role === "signalOut"
                ? "signal output"
                : pin.role === "anode"
                  ? "anode (+)"
                  : pin.role === "cathode"
                    ? "cathode (-)"
                    : pin.role === "loadOut"
                      ? "motor / load output"
                      : "passive terminal";
  return editable ? `${pin.name} · ${roleLabel} · click to wire, Shift/Alt-click to lift wire` : `${pin.name} · ${roleLabel}`;
}

export function CircuitBench({ circuit, onChange, outputs, running, readOnly, pressed, onPress, sensorValues, onSensor, highlight = [], fit }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ kind: "part" | "wire"; id: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0]);
  const editable = !readOnly && !running;
  const byId = useMemo(() => new Map(circuit.parts.map((p) => [p.id, p])), [circuit.parts]);

  // --- view: pan + zoom (pinch, ctrl/⌘-wheel, buttons) so a phone-sized screen can reach every pin ---
  const gesture = useGestureLock(!!fit);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<{ cx: number; cy: number; s: number } | null>(null); // null = fit to the parts
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const panning = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const fitView = useMemo(() => {
    const defs = circuit.parts.map((p) => ({ p, d: CATALOG_BY_TYPE[p.type] })).filter((x) => x.d);
    if (!defs.length || !size.w || !size.h) return { cx: W / 2, cy: H / 2, s: size.w ? size.w / W : 1 };
    const x0 = Math.min(...defs.map(({ p }) => p.x)) - 30;
    const y0 = Math.min(...defs.map(({ p }) => p.y)) - 30;
    const x1 = Math.max(...defs.map(({ p, d }) => p.x + d.w)) + 30;
    const y1 = Math.max(...defs.map(({ p, d }) => p.y + d.h)) + 40;
    const s = Math.min(size.w / (x1 - x0), size.h / (y1 - y0), 2.2);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s };
  }, [circuit.parts, size]);
  const v = view ?? fitView;
  const vbW = size.w ? size.w / v.s : W;
  const vbH = size.h ? size.h / v.s : H;
  const viewBox = `${v.cx - vbW / 2} ${v.cy - vbH / 2} ${vbW} ${vbH}`;
  const zoomAt = (factor: number, px?: number, py?: number) => {
    const cur = view ?? fitView;
    const s = Math.max(0.25, Math.min(4, cur.s * factor));
    if (px === undefined || py === undefined) return setView({ ...cur, s });
    // keep the world point under the fingers where it is
    const wx = cur.cx + (px - size.w / 2) / cur.s;
    const wy = cur.cy + (py - size.h / 2) / cur.s;
    setView({ cx: wx - (px - size.w / 2) / s, cy: wy - (py - size.h / 2) / s, s });
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ctrl/⌘ + wheel (and trackpad pinch) zooms; in the full-screen stage the plain wheel does too
  const zoomRef = useRef(zoomAt);
  useEffect(() => {
    zoomRef.current = zoomAt;
  });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || fit)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit]);

  const toSvg = (e: React.PointerEvent) => {
    const s = svg.current!;
    const pt = s.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = s.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  };

  useEffect(() => {
    if (!pendingPin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingPin(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingPin]);

  const clickPin = (t: string, e?: React.MouseEvent) => {
    if (!editable) return;
    if (!pendingPin && (e?.shiftKey || e?.altKey)) {
      const idx = circuit.wires.findIndex((w) => w.from === t || w.to === t);
      if (idx >= 0) {
        const lifted = circuit.wires[idx];
        const anchor = lifted.from === t ? lifted.to : lifted.from;
        onChange({ ...circuit, wires: circuit.wires.filter((_, i) => i !== idx) });
        setPendingPin(anchor);
        return;
      }
    }
    if (!pendingPin) {
      setPendingPin(t);
      return;
    }
    if (pendingPin === t) {
      setPendingPin(null);
      return;
    }
    const exists = circuit.wires.some((w) => (w.from === pendingPin && w.to === t) || (w.from === t && w.to === pendingPin));
    if (!exists) {
      const ids = new Set(circuit.wires.map((w) => w.id));
      onChange({ ...circuit, wires: [...circuit.wires, { id: nextId("w", ids), from: pendingPin, to: t, color: wireColor }] });
    }
    setPendingPin(null);
  };

  const addPart = (type: string) => {
    const def = CATALOG_BY_TYPE[type];
    const ids = new Set(circuit.parts.map((p) => p.id));
    const prefix = type === "board" ? "board" : type === "led" ? "led" : type === "resistor" ? "r" : type === "button" ? "btn" : type === "switch" ? "sw" : type.replace(/_.*/, "");
    const id = type === "board" && !ids.has("board") ? "board" : nextId(prefix, ids);
    const n = circuit.parts.length;
    const part: CircuitPart = { id, type, x: 80 + ((n * 90) % 700), y: type === "board" ? 300 : 40 + Math.floor(n / 8) * 90, props: def.props ? { ...def.props } : undefined };
    onChange({ ...circuit, parts: [...circuit.parts, part] });
    setSelected({ kind: "part", id });
  };

  const removeSelected = () => {
    if (!selected) return;
    if (selected.kind === "wire") onChange({ ...circuit, wires: circuit.wires.filter((w) => w.id !== selected.id) });
    else onChange({ parts: circuit.parts.filter((p) => p.id !== selected.id), wires: circuit.wires.filter((w) => !w.from.startsWith(`${selected.id}.`) && !w.to.startsWith(`${selected.id}.`)) });
    setSelected(null);
  };

  const updateProps = (id: string, patch: Partial<CircuitPart>) => onChange({ ...circuit, parts: circuit.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const sel = selected?.kind === "part" ? byId.get(selected.id) : undefined;
  const selDef = sel ? CATALOG_BY_TYPE[sel.type] : undefined;

  return (
    <div className={cn("flex flex-col gap-2", fit && "h-full min-h-0")}>
      {editable && (
        <div className={cn("flex items-center gap-1.5 flex-nowrap overflow-x-auto shrink-0 pb-1 sm:pb-0", !fit && "sm:flex-wrap sm:overflow-visible")}>
          {CATALOG.filter((c) => c.type !== "board" || !circuit.parts.some((p) => p.type === "board")).map((c) => (
            <button key={c.type} type="button" onClick={() => addPart(c.type)} title={c.description} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 sm:py-1 text-xs sm:text-[11px] font-semibold hover:border-brand-500 active:bg-brand-500/10 whitespace-nowrap">
              <Plus className="h-3 w-3" /> {c.name.replace(/ \(.*\)/, "")}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1" aria-label="Wire colour">
            {WIRE_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setWireColor(c)} className={cn("h-5 w-5 rounded-full border-2", wireColor === c ? "border-brand-500" : "border-transparent")} style={{ background: c }} aria-label={`Wire colour ${c}`} />
            ))}
          </span>
        </div>
      )}
      {/* On phones the bench keeps a usable size and scrolls sideways, so pins stay big enough to tap */}
      <div
        ref={box}
        className={cn("relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#0b1220] overflow-hidden", fit ? "flex-1 min-h-0" : "h-[58vh] min-h-[300px] max-h-[620px] sm:h-[420px]")}
        onPointerDownCapture={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = Array.from(pointers.current.values());
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: (view ?? fitView).s };
            setDrag(null);
            panning.current = null;
          }
        }}
        onPointerMoveCapture={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current && pointers.current.size >= 2) {
            const [a, b] = Array.from(pointers.current.values());
            const r = box.current!.getBoundingClientRect();
            const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const cur = view ?? fitView;
            const target = pinch.current.s * (dist / pinch.current.dist);
            zoomAt(target / cur.s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
          }
        }}
        onPointerUpCapture={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
        }}
        onPointerCancelCapture={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          panning.current = null;
          setDrag(null);
        }}
      >
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <svg
          ref={svg}
          viewBox={viewBox}
          className="h-full w-full select-none"
          style={{ touchAction: gesture.interactive ? "none" : "pan-y" }}
          onPointerDown={(e) => {
            // one finger / the mouse on empty bench slides the view
            if (e.target !== svg.current || !gesture.interactive || pointers.current.size > 1) return;
            const cur = view ?? fitView;
            panning.current = { x: e.clientX, y: e.clientY, cx: cur.cx, cy: cur.cy };
          }}
          onPointerMove={(e) => {
            if (panning.current && !drag && pointers.current.size < 2) {
              const cur = view ?? fitView;
              const dx = (e.clientX - panning.current.x) / cur.s;
              const dy = (e.clientY - panning.current.y) / cur.s;
              if (Math.abs(dx) + Math.abs(dy) > 2) setView({ ...cur, cx: panning.current.cx - dx, cy: panning.current.cy - dy });
              return;
            }
            if (!drag || !editable || pinch.current) return;
            const p = toSvg(e);
            const x = Math.max(0, Math.min(W - 20, p.x - drag.dx));
            const y = Math.max(0, Math.min(H - 20, p.y - drag.dy));
            if (!drag.moved) setDrag({ ...drag, moved: true });
            onChange({ ...circuit, parts: circuit.parts.map((pp) => (pp.id === drag.id ? { ...pp, x: Math.round(x), y: Math.round(y) } : pp)) });
          }}
          onPointerUp={() => {
            setDrag(null);
            panning.current = null;
          }}
          onPointerLeave={() => {
            setDrag(null);
            panning.current = null;
          }}
          onClick={(e) => {
            if (e.target === svg.current) {
              setSelected(null);
              setPendingPin(null);
            }
          }}
        >
          <defs>
            <pattern id="bench-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={-3000} y={-3000} width={6000 + W} height={6000 + H} fill="url(#bench-grid)" pointerEvents="none" />

          {/* parts */}
          {circuit.parts.map((p) => {
            const def = CATALOG_BY_TYPE[p.type];
            if (!def) return null;
            const isSel = selected?.kind === "part" && selected.id === p.id;
            const hl = highlight.includes(p.id);
            return (
              <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
                <g
                  style={{ cursor: editable ? "grab" : isButtonLike(p.type) ? "pointer" : "default" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (running && isButtonLike(p.type)) {
                      onPress(p.id, true);
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      return;
                    }
                    if (!editable || !gesture.interactive) return;
                    const pt = toSvg(e);
                    setDrag({ id: p.id, dx: pt.x - p.x, dy: pt.y - p.y, moved: false });
                  }}
                  onPointerUp={(e) => {
                    if (running && isButtonLike(p.type)) {
                      e.stopPropagation();
                      onPress(p.id, false);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected({ kind: "part", id: p.id });
                  }}
                >
                  {(isSel || hl) && <rect x={-6} y={-6} width={def.w + 12} height={def.h + 12} rx={8} fill="none" stroke={hl ? "#f59e0b" : "#14b8a6"} strokeDasharray="5 4" strokeWidth={2} />}
                  <PartArt p={p} def={def} out={outputs[p.id]} pressed={pressed.has(p.id)} />
                  <text x={0} y={def.h + 24} fontSize={11} fill="#cbd5e1" fontWeight={600}>{p.label || p.id}</text>
                </g>
                {/* pins */}
                {def.pins.map((pin) => {
                  const t = `${p.id}.${pin.name}`;
                  const px = pin.x * def.w;
                  const py = pin.y * def.h;
                  const isPending = pendingPin === t;
                  const color = pin.role === "power" ? "#ef4444" : pin.role === "ground" ? "#94a3b8" : pin.role === "analog" ? "#a855f7" : "#fbbf24";
                  const labelBelow = p.type === "board" && pin.y >= 1;
                  return (
                    <g key={pin.name} onClick={(e) => { e.stopPropagation(); clickPin(t, e); }} style={{ cursor: editable ? "crosshair" : "default" }}>
                      <title>{pinTooltip(pin, editable)}</title>
                      <circle cx={px} cy={py} r={Math.min(16, Math.max(11, 22 / v.s))} fill="transparent" />
                      <circle cx={px} cy={py} r={(isPending ? 7 : 4.5) * Math.min(1.8, Math.max(1, 0.9 / v.s))} fill={isPending ? "#14b8a6" : color} stroke="#0b1220" strokeWidth={1.5} />
                      {p.type === "board" && (
                        <text x={px} y={labelBelow ? py + 16 : py - 9} textAnchor="middle" fontSize={8.5} fill="#e2e8f0" fontFamily="monospace">{pin.name}{pin.pwm ? "~" : ""}</text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* wires on top */}
          {circuit.wires.map((w) => {
            const [pa, pina] = w.from.split(".");
            const [pb, pinb] = w.to.split(".");
            const A = byId.get(pa);
            const B = byId.get(pb);
            if (!A || !B) return null;
            const da = CATALOG_BY_TYPE[A.type];
            const db = CATALOG_BY_TYPE[B.type];
            if (!da || !db) return null;
            const a = pinPos(A, da, pina);
            const b = pinPos(B, db, pinb);
            const sag = Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.25);
            const d = `M${a.x},${a.y} Q${(a.x + b.x) / 2},${Math.max(a.y, b.y) + sag} ${b.x},${b.y}`;
            const isSel = selected?.kind === "wire" && selected.id === w.id;
            return (
              <g key={w.id} onClick={(e) => { e.stopPropagation(); if (editable) setSelected({ kind: "wire", id: w.id }); }} style={{ cursor: editable ? "pointer" : "default" }}>
                <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
                <path d={d} stroke="#020617" strokeOpacity={0.55} strokeWidth={5.5} transform="translate(0 3)" fill="none" strokeLinecap="round" />
                <path d={d} stroke={isSel ? "#14b8a6" : w.color || "#ef4444"} strokeWidth={isSel ? 4.5 : 3.2} fill="none" strokeLinecap="round" opacity={0.96} />
                <circle cx={a.x} cy={a.y} r={3.2} fill={isSel ? "#14b8a6" : w.color || "#ef4444"} stroke="#0b1220" strokeWidth={1} />
                <circle cx={b.x} cy={b.y} r={3.2} fill={isSel ? "#14b8a6" : w.color || "#ef4444"} stroke="#0b1220" strokeWidth={1} />
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1.5">
          {[
            { label: "Zoom in", icon: <ZoomIn className="h-5 w-5" />, on: () => zoomAt(1.3) },
            { label: "Zoom out", icon: <ZoomOut className="h-5 w-5" />, on: () => zoomAt(1 / 1.3) },
            { label: "Fit to the parts", icon: <Maximize className="h-5 w-5" />, on: () => setView(null) },
          ].map((b) => (
            <button key={b.label} type="button" onClick={b.on} aria-label={b.label} title={b.label} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/85 text-white border border-white/30 shadow-lg active:bg-slate-700">
              {b.icon}
            </button>
          ))}
        </div>
        {gesture.canToggle && <GestureToggle active={gesture.active} onChange={gesture.setActive} className="absolute top-2 right-2 z-10" />}
        {gesture.canToggle && !gesture.active && !pendingPin && <p className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[60%] rounded-lg bg-slate-900/70 px-2 py-1 text-[10px] text-white">Swipe scrolls the page · tap pins to wire · tap Move &amp; zoom to drag parts</p>}
        {pendingPin && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold px-2.5 py-1 shadow">
            <span>Wiring from {pendingPin} — tap another pin (Esc cancels)</span>
            <button type="button" onClick={() => setPendingPin(null)} aria-label="Cancel wiring" className="rounded p-0.5 hover:bg-black/20">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* selection panel */}
      {selected && editable && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-xs">
          {selected.kind === "wire" ? (
            <span className="font-semibold">Wire {circuit.wires.find((w) => w.id === selected.id)?.from} → {circuit.wires.find((w) => w.id === selected.id)?.to}</span>
          ) : sel && selDef ? (
            <>
              <span className="font-semibold">{selDef.name}</span>
              <input value={sel.label || ""} onChange={(e) => updateProps(sel.id, { label: e.target.value.slice(0, 40) || undefined })} placeholder={sel.id} className="h-7 w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2" aria-label="Label" />
              {sel.type === "led" && (
                <select value={String(sel.props?.color || "red")} onChange={(e) => updateProps(sel.id, { props: { ...sel.props, color: e.target.value } })} className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-1" aria-label="LED colour">
                  {Object.keys(LED_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {sel.type === "resistor" && (
                <select value={String(sel.props?.ohms ?? 220)} onChange={(e) => updateProps(sel.id, { props: { ...sel.props, ohms: Number(e.target.value) } })} className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-1" aria-label="Resistance">
                  {[10, 100, 220, 330, 470, 1000, 4700, 10000].map((o) => <option key={o} value={o}>{o >= 1000 ? `${o / 1000} kΩ` : `${o} Ω`}</option>)}
                </select>
              )}
              {sel.type === "battery" && (
                <select value={String(sel.props?.volts ?? 6)} onChange={(e) => updateProps(sel.id, { props: { ...sel.props, volts: Number(e.target.value) } })} className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-1" aria-label="Battery voltage">
                  {[1.5, 3, 4.5, 6, 9, 12].map((bv) => <option key={bv} value={bv}>{bv} V</option>)}
                </select>
              )}
              {sel.type === "bulb" && (
                <select value={String(sel.props?.ohms ?? 12)} onChange={(e) => updateProps(sel.id, { props: { ...sel.props, ohms: Number(e.target.value) } })} className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-1" aria-label="Bulb resistance">
                  {[6, 12, 24, 50, 100].map((bo) => <option key={bo} value={bo}>{bo} Ω</option>)}
                </select>
              )}
              <span className="text-slate-500 hidden sm:inline">{selDef.description}</span>
            </>
          ) : null}
          <button type="button" onClick={removeSelected} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="p-1 text-slate-400"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* live sensor controls while running */}
      {running && circuit.parts.some((p) => ["potentiometer", "light_sensor", "temp_sensor", "hc_sr04"].includes(p.type)) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {circuit.parts.filter((p) => ["potentiometer", "light_sensor", "temp_sensor", "hc_sr04"].includes(p.type)).map((p) => {
            const dist = p.type === "hc_sr04";
            const v = sensorValues[p.id] ?? Number(p.props?.value ?? 512);
            if (dist)
              return (
                <label key={p.id} className="flex items-center gap-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <span className="font-semibold w-28 truncate">{p.label || p.id} (object distance)</span>
                  <input type="range" min={0} max={450} value={v} onChange={(e) => onSensor(p.id, Number(e.target.value))} className="flex-1 accent-brand-600" />
                  <span className="font-mono w-14 text-right">{v} cm</span>
                </label>
              );
            return (
              <label key={p.id} className="flex items-center gap-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                <span className="font-semibold w-28 truncate">{p.label || p.id}</span>
                <input type="range" min={0} max={1023} value={v} onChange={(e) => onSensor(p.id, Number(e.target.value))} className="flex-1 accent-brand-600" />
                <span className="font-mono w-10 text-right">{v}</span>
              </label>
            );
          })}
        </div>
      )}
      {running && circuit.parts.some((p) => p.type === "dht11" || p.type === "mpu6050") && (
        <div className="grid gap-2 sm:grid-cols-2">
          {circuit.parts.filter((p) => p.type === "dht11" || p.type === "mpu6050").flatMap((p) => {
            const dht = p.type === "dht11";
            const rows = dht
              ? [
                  { key: p.id, label: "temperature", min: 0, max: 50, unit: "°C", def: Number(p.props?.value ?? 24) },
                  { key: `${p.id}#b`, label: "humidity", min: 20, max: 90, unit: "%RH", def: Number(p.props?.humidity ?? 55) },
                ]
              : [
                  { key: p.id, label: "tilt X", min: -90, max: 90, unit: "°", def: Number(p.props?.value ?? 0) },
                  { key: `${p.id}#b`, label: "tilt Y", min: -90, max: 90, unit: "°", def: Number(p.props?.tiltY ?? 0) },
                ];
            return rows.map((r) => {
              const v = sensorValues[r.key] ?? r.def;
              return (
                <label key={r.key} className="flex items-center gap-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <span className="font-semibold w-28 truncate">{p.label || p.id} {r.label}</span>
                  <input type="range" min={r.min} max={r.max} value={v} onChange={(e) => onSensor(r.key, Number(e.target.value))} className="flex-1 accent-brand-600" />
                  <span className="font-mono w-16 text-right">{v} {r.unit}</span>
                </label>
              );
            });
          })}
        </div>
      )}
      {running && circuit.parts.some((p) => isButtonLike(p.type)) && <p className="text-[11px] text-slate-500">Press and hold a button to push it; tap a switch to flip it. You can do the same on the 3D model.</p>}
    </div>
  );
}
