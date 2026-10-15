"use client";

import React, { useMemo, useRef, useState } from "react";
import { Trash2, Plus, X } from "lucide-react";
import { CATALOG, CATALOG_BY_TYPE, LED_COLORS, isButtonLike, type ComponentDef } from "@/lib/studio/circuit/catalog";
import type { OutputState } from "@/lib/studio/circuit/netlist";
import type { CircuitPart, Wire } from "@/lib/studio/spec";
import { cn } from "@/lib/utils";

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

function PartArt({ p, def, out, pressed }: { p: CircuitPart; def: ComponentDef; out?: OutputState; pressed: boolean }) {
  const { w, h } = def;
  switch (p.type) {
    case "board":
      return (
        <g>
          <rect width={w} height={h} rx={8} fill="#0f5132" stroke="#22c55e" strokeWidth={1.5} />
          <rect x={w / 2 - 30} y={h / 2 - 14} width={60} height={28} rx={3} fill="#111827" />
          <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="monospace">MCU</text>
          <text x={10} y={h / 2 + 4} fontSize={12} fill="#bbf7d0" fontWeight={700}>Starter board</text>
        </g>
      );
    case "led": {
      const col = LED_COLORS[String(p.props?.color || "red")] || "#ef4444";
      const lvl = out?.on ? out.level : 0;
      return (
        <g>
          {lvl > 0 && <circle cx={w / 2} cy={22} r={30} fill={col} opacity={0.25 * lvl + 0.1} />}
          <path d={`M${w / 2 - 14},40 L${w / 2 - 14},18 A14,14 0 0 1 ${w / 2 + 14},18 L${w / 2 + 14},40 Z`} fill={col} opacity={0.25 + 0.75 * lvl} stroke={col} strokeWidth={2} />
          <rect x={w / 2 - 17} y={38} width={34} height={5} fill={col} opacity={0.7} />
          <line x1={0.3 * w} y1={43} x2={0.3 * w} y2={h} stroke="#9ca3af" strokeWidth={2} />
          <line x1={0.7 * w} y1={43} x2={0.7 * w} y2={h - 8} stroke="#9ca3af" strokeWidth={2} />
          <text x={0.3 * w - 9} y={h - 10} fontSize={10} fill="#ef4444">+</text>
          {out?.fault === "overcurrent" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={11} fill="#ef4444" fontWeight={700}>⚠ burning out</text>}
          {out?.fault === "reversed" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={11} fill="#f59e0b" fontWeight={700}>⟲ reversed</text>}
        </g>
      );
    }
    case "resistor": {
      const ohms = Number(p.props?.ohms ?? 220);
      return (
        <g>
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#9ca3af" strokeWidth={2} />
          <rect x={18} y={4} width={w - 36} height={h - 8} rx={8} fill="#d6b88d" stroke="#92704a" />
          {[28, 38, 48].map((x, i) => <rect key={x} x={x} y={4} width={4} height={h - 8} fill={["#7c3aed", "#ef4444", "#78350f"][i]} />)}
          <text x={w / 2} y={h + 12} textAnchor="middle" fontSize={10} fill="#94a3b8">{ohms >= 1000 ? `${ohms / 1000}kΩ` : `${ohms}Ω`}</text>
        </g>
      );
    }
    case "button":
      return (
        <g>
          <rect width={w} height={h - 10} rx={6} fill="#1f2937" stroke="#6b7280" />
          <circle cx={w / 2} cy={(h - 10) / 2} r={14} fill={pressed ? "#2563eb" : "#3b82f6"} stroke="#1e3a8a" strokeWidth={pressed ? 4 : 2} />
          <line x1={0} y1={h - 10} x2={0} y2={h} stroke="#9ca3af" strokeWidth={2} />
          <line x1={w} y1={h - 10} x2={w} y2={h} stroke="#9ca3af" strokeWidth={2} />
        </g>
      );
    case "ir_sensor":
      return (
        <g>
          <rect width={w} height={h - 8} rx={6} fill="#0f172a" stroke="#94a3b8" />
          <circle cx={w * 0.32} cy={(h - 8) / 2} r={7} fill="#1e293b" stroke="#475569" />
          <circle cx={w * 0.68} cy={(h - 8) / 2} r={7} fill={(out?.on ?? pressed) ? "#f87171" : "#7f1d1d"} stroke="#475569" />
          <text x={w / 2} y={h - 12} textAnchor="middle" fontSize={8} fill="#94a3b8">IR</text>
        </g>
      );
    case "switch":
      return (
        <g>
          <rect width={w} height={h - 14} rx={8} fill="#1f2937" stroke="#6b7280" />
          <rect x={8} y={(h - 14) / 2 - 7} width={w - 16} height={14} rx={7} fill={pressed ? "#16a34a" : "#374151"} />
          <circle cx={pressed ? w - 16 : 16} cy={(h - 14) / 2} r={9} fill={pressed ? "#bbf7d0" : "#e5e7eb"} stroke="#111827" />
          <text x={w / 2} y={h - 16 + 1} textAnchor="middle" fontSize={9} fill="#94a3b8">{pressed ? "ON" : "OFF"}</text>
          <line x1={0} y1={h - 14} x2={0} y2={h} stroke="#9ca3af" strokeWidth={2} />
          <line x1={w} y1={h - 14} x2={w} y2={h} stroke="#9ca3af" strokeWidth={2} />
        </g>
      );
    case "buzzer":
      return (
        <g>
          <circle cx={w / 2} cy={h / 2 - 4} r={20} fill="#111827" stroke="#6b7280" />
          <circle cx={w / 2} cy={h / 2 - 4} r={4} fill="#374151" />
          {out?.on && [26, 32].map((r) => <circle key={r} cx={w / 2} cy={h / 2 - 4} r={r} fill="none" stroke="#facc15" strokeWidth={2} opacity={0.6} />)}
        </g>
      );
    case "potentiometer":
    case "light_sensor":
    case "temp_sensor": {
      const v = Number(p.props?.value ?? 512);
      return (
        <g>
          <rect width={w} height={h - 8} rx={6} fill={p.type === "potentiometer" ? "#1e3a8a" : p.type === "light_sensor" ? "#166534" : "#7c2d12"} stroke="#94a3b8" />
          {p.type === "potentiometer" ? (
            <g transform={`rotate(${(v / 1023) * 270 - 135} ${w / 2} ${(h - 8) / 2})`}>
              <circle cx={w / 2} cy={(h - 8) / 2} r={16} fill="#cbd5e1" />
              <line x1={w / 2} y1={(h - 8) / 2} x2={w / 2} y2={(h - 8) / 2 - 14} stroke="#0f172a" strokeWidth={3} />
            </g>
          ) : (
            <text x={w / 2} y={(h - 8) / 2 + 5} textAnchor="middle" fontSize={16}>{p.type === "light_sensor" ? "☀" : "🌡"}</text>
          )}
        </g>
      );
    }
    case "servo":
      return (
        <g>
          <rect width={w} height={h - 8} rx={4} fill="#1e40af" stroke="#93c5fd" />
          <g transform={`rotate(${(out?.angle ?? 90) - 90} ${w * 0.3} ${(h - 8) / 2})`}>
            <rect x={w * 0.3 - 4} y={(h - 8) / 2 - 30} width={8} height={30} rx={4} fill="#f8fafc" />
          </g>
          <circle cx={w * 0.3} cy={(h - 8) / 2} r={7} fill="#f8fafc" />
          <text x={w * 0.68} y={(h - 8) / 2 + 4} textAnchor="middle" fontSize={10} fill="#dbeafe">{Math.round(out?.angle ?? 90)}°</text>
        </g>
      );
    case "l298n":
    case "tb6612": {
      const l = p.type === "l298n";
      return (
        <g>
          <rect width={w} height={h} rx={5} fill={l ? "#b91c1c" : "#1e3a8a"} stroke="#fecaca" />
          <rect x={w * 0.34} y={10} width={w * 0.32} height={h * 0.45} rx={3} fill="#111827" stroke="#9ca3af" />
          <text x={w / 2} y={h * 0.32} textAnchor="middle" fontSize={11} fill="#f8fafc" fontWeight={800}>{l ? "L298N" : "TB6612"}</text>
          <text x={w / 2} y={h * 0.58} textAnchor="middle" fontSize={8} fill="#fecaca">{out?.on ? (out.fault ? out.fault : "driving") : out?.fault || "idle"}</text>
          <text x={w * 0.2} y={14} textAnchor="middle" fontSize={8} fill="#fee2e2">A</text>
          <text x={w * 0.86} y={14} textAnchor="middle" fontSize={8} fill="#fee2e2">B</text>
        </g>
      );
    }
    case "hc_sr04":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#1e40af" stroke="#93c5fd" />
          <circle cx={w * 0.27} cy={(h - 8) / 2} r={14} fill="#cbd5e1" stroke="#475569" strokeWidth={3} />
          <circle cx={w * 0.73} cy={(h - 8) / 2} r={14} fill="#cbd5e1" stroke="#475569" strokeWidth={3} />
          <text x={w / 2} y={h - 12} textAnchor="middle" fontSize={8} fill="#bfdbfe">HC-SR04</text>
        </g>
      );
    case "stepper": {
      const rot = out?.rotation ?? 0;
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#1e3a8a" stroke="#93c5fd" />
          <circle cx={w * 0.3} cy={(h - 8) / 2} r={26} fill="#9ca3af" stroke="#e5e7eb" strokeWidth={2} />
          <g transform={`rotate(${rot} ${w * 0.3} ${(h - 8) / 2})`}>
            <rect x={w * 0.3 - 3} y={(h - 8) / 2 - 24} width={6} height={24} rx={3} fill="#f8fafc" />
          </g>
          <circle cx={w * 0.3} cy={(h - 8) / 2} r={5} fill="#f8fafc" />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={w * (0.62 + i * 0.08)} cy={14} r={4} fill={out?.on ? "#fbbf24" : "#475569"} />)}
          <text x={w * 0.76} y={(h - 8) / 2 + 12} textAnchor="middle" fontSize={9} fill="#dbeafe">{Math.round(((rot % 360) + 360) % 360)}°</text>
          <text x={w * 0.76} y={(h - 8) / 2 + 24} textAnchor="middle" fontSize={7} fill="#bfdbfe">28BYJ-48</text>
        </g>
      );
    }
    case "oled": {
      const lines = out?.text ?? [];
      return (
        <g>
          <rect width={w} height={h - 8} rx={4} fill="#111827" stroke="#64748b" />
          <rect x={6} y={6} width={w - 12} height={h - 20} fill="#020617" stroke="#334155" />
          {lines.slice(0, 8).map((t, i) => <text key={i} x={9} y={15 + i * 5.4} fontSize={5} fill="#7dd3fc" fontFamily="monospace">{t}</text>)}
          {!out?.on && <text x={w / 2} y={(h - 8) / 2 + 3} textAnchor="middle" fontSize={8} fill="#475569">{out?.fault || "SSD1306"}</text>}
        </g>
      );
    }
    case "dht11":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#0ea5e9" stroke="#bae6fd" />
          {[0, 1, 2, 3].map((i) => <line key={i} x1={8} x2={w - 8} y1={9 + i * 6} y2={9 + i * 6} stroke="#0369a1" strokeWidth={2} />)}
          <text x={w / 2} y={(h - 8) / 2 + 12} textAnchor="middle" fontSize={9} fill="#f0f9ff" fontWeight={700}>DHT11</text>
        </g>
      );
    case "relay":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#1e3a8a" stroke="#93c5fd" />
          <rect x={w * 0.12} y={14} width={w * 0.55} height={(h - 8) * 0.55} rx={3} fill="#2563eb" stroke="#bfdbfe" />
          <text x={w * 0.395} y={14 + (h - 8) * 0.3} textAnchor="middle" fontSize={9} fill="#eff6ff" fontWeight={700}>RELAY</text>
          <circle cx={w * 0.85} cy={22} r={5} fill={out?.energised ? "#4ade80" : "#14532d"} />
          <text x={w * 0.85} y={40} textAnchor="middle" fontSize={8} fill="#bfdbfe">{out?.energised ? "COM-NO" : "COM-NC"}</text>
        </g>
      );
    case "mpu6050":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#1d4ed8" stroke="#bfdbfe" />
          <rect x={w / 2 - 10} y={(h - 8) / 2 - 10} width={20} height={20} rx={2} fill="#111827" />
          <text x={w / 2} y={(h - 8) / 2 + 3} textAnchor="middle" fontSize={6} fill="#9ca3af">MPU</text>
        </g>
      );
    case "battery":
      return (
        <g>
          <rect width={w} height={h - 10} rx={6} fill="#a16207" stroke="#fde68a" />
          <text x={w / 2} y={(h - 10) / 2 + 4} textAnchor="middle" fontSize={13} fill="#fffbeb" fontWeight={800}>{`${Number(p.props?.volts ?? 6)} V`}</text>
        </g>
      );
    case "motor_driver":
      return (
        <g>
          <rect width={w} height={h} rx={4} fill="#991b1b" stroke="#fca5a5" />
          <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={10} fill="#fee2e2" fontWeight={700}>DRIVER</text>
          {out?.fault === "unpowered" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={10} fill="#f59e0b">no power</text>}
        </g>
      );
    case "dc_motor":
      return (
        <g>
          <circle cx={w / 2} cy={h / 2 - 4} r={24} fill="#6b7280" stroke="#d1d5db" />
          <g style={out?.on ? { transformOrigin: `${w / 2}px ${h / 2 - 4}px`, animation: `spin ${Math.max(0.15, 1.2 - out.level)}s linear infinite`, animationDirection: out.direction === -1 ? "reverse" : "normal" } : undefined}>
            <line x1={w / 2 - 18} y1={h / 2 - 4} x2={w / 2 + 18} y2={h / 2 - 4} stroke="#f8fafc" strokeWidth={4} />
          </g>
          {out?.fault === "overcurrent" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={10} fill="#ef4444">⚠ needs a driver</text>}
        </g>
      );
    default:
      return <rect width={w} height={h} fill="#374151" />;
  }
}

export function CircuitBench({ circuit, onChange, outputs, running, readOnly, pressed, onPress, sensorValues, onSensor, highlight = [], fit }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ kind: "part" | "wire"; id: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0]);
  const editable = !readOnly && !running;
  const byId = useMemo(() => new Map(circuit.parts.map((p) => [p.id, p])), [circuit.parts]);

  const toSvg = (e: React.PointerEvent) => {
    const s = svg.current!;
    const pt = s.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = s.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  };

  const clickPin = (t: string) => {
    if (!editable) return;
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
        <div className={cn("flex items-center gap-1.5", fit ? "flex-nowrap overflow-x-auto shrink-0 pb-1" : "flex-wrap")}>
          {CATALOG.filter((c) => c.type !== "board" || !circuit.parts.some((p) => p.type === "board")).map((c) => (
            <button key={c.type} type="button" onClick={() => addPart(c.type)} title={c.description} className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold hover:border-teal-500">
              <Plus className="h-3 w-3" /> {c.name.replace(/ \(.*\)/, "")}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1" aria-label="Wire colour">
            {WIRE_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setWireColor(c)} className={cn("h-5 w-5 rounded-full border-2", wireColor === c ? "border-teal-500" : "border-transparent")} style={{ background: c }} aria-label={`Wire colour ${c}`} />
            ))}
          </span>
        </div>
      )}
      {/* On phones the bench keeps a usable size and scrolls sideways, so pins stay big enough to tap */}
      <div className={cn("relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#0b1220]", fit ? "flex-1 min-h-0 overflow-hidden" : "overflow-x-auto overflow-y-hidden")}>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className={cn("w-full touch-none select-none", fit ? "h-full" : "min-w-[760px] h-auto")}
          onPointerMove={(e) => {
            if (!drag || !editable) return;
            const p = toSvg(e);
            const x = Math.max(0, Math.min(W - 20, p.x - drag.dx));
            const y = Math.max(0, Math.min(H - 20, p.y - drag.dy));
            if (!drag.moved) setDrag({ ...drag, moved: true });
            onChange({ ...circuit, parts: circuit.parts.map((pp) => (pp.id === drag.id ? { ...pp, x: Math.round(x), y: Math.round(y) } : pp)) });
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
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
          <rect width={W} height={H} fill="url(#bench-grid)" pointerEvents="none" />

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
                    if (!editable) return;
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
                    <g key={pin.name} onClick={(e) => { e.stopPropagation(); clickPin(t); }} style={{ cursor: editable ? "crosshair" : "default" }}>
                      <circle cx={px} cy={py} r={11} fill="transparent" />
                      <circle cx={px} cy={py} r={isPending ? 7 : 4.5} fill={isPending ? "#14b8a6" : color} stroke="#0b1220" strokeWidth={1.5} />
                      {p.type === "board" ? (
                        <text x={px} y={labelBelow ? py + 16 : py - 9} textAnchor="middle" fontSize={8.5} fill="#e2e8f0" fontFamily="monospace">{pin.name}{pin.pwm ? "~" : ""}</text>
                      ) : (
                        <title>{`${pin.name} (${pin.role})`}</title>
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
                <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
                <path d={d} stroke={isSel ? "#14b8a6" : w.color || "#ef4444"} strokeWidth={isSel ? 4.5 : 3} fill="none" strokeLinecap="round" opacity={0.95} />
              </g>
            );
          })}
        </svg>
        {pendingPin && <div className="absolute top-2 left-2 rounded-lg bg-teal-600 text-white text-xs font-semibold px-2 py-1">Wiring from {pendingPin} — tap another pin</div>}
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
                  <input type="range" min={0} max={450} value={v} onChange={(e) => onSensor(p.id, Number(e.target.value))} className="flex-1 accent-teal-600" />
                  <span className="font-mono w-14 text-right">{v} cm</span>
                </label>
              );
            return (
              <label key={p.id} className="flex items-center gap-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                <span className="font-semibold w-28 truncate">{p.label || p.id}</span>
                <input type="range" min={0} max={1023} value={v} onChange={(e) => onSensor(p.id, Number(e.target.value))} className="flex-1 accent-teal-600" />
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
                  <input type="range" min={r.min} max={r.max} value={v} onChange={(e) => onSensor(r.key, Number(e.target.value))} className="flex-1 accent-teal-600" />
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
