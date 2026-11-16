"use client";

import React from "react";
import { LED_COLORS, type ComponentDef } from "@/lib/studio/circuit/catalog";
import type { OutputState } from "@/lib/studio/circuit/netlist";
import type { CircuitPart } from "@/lib/studio/spec";

const EIA_DIGITS = ["#111827", "#78350f", "#dc2626", "#f97316", "#facc15", "#16a34a", "#2563eb", "#7c3aed", "#64748b", "#f8fafc"];
const EIA_MULT: Record<number, string> = {
  [-1]: "#eab308",
  0: "#111827",
  1: "#78350f",
  2: "#dc2626",
  3: "#f97316",
  4: "#facc15",
  5: "#16a34a",
  6: "#2563eb",
};

function resistorBands(ohms: number): [string, string, string, string] {
  const safe = Math.max(1, Math.round(ohms));
  const s = String(safe);
  const d1 = Number(s[0]) || 0;
  const d2 = Number(s[1] ?? 0);
  const exp = Math.max(0, s.length - 2);
  return [EIA_DIGITS[d1] || "#dc2626", EIA_DIGITS[d2] || "#dc2626", EIA_MULT[exp] || "#78350f", "#d97706"];
}

export function PartArt({ p, def, out, pressed }: { p: CircuitPart; def: ComponentDef; out?: OutputState; pressed: boolean }) {
  const { w, h } = def;
  switch (p.type) {
    case "board": {
      const topXs = Array.from({ length: 12 }, (_, i) => ((i + 1) / 13) * w);
      const pwrXs = [1 / 14, 2 / 14, 3 / 14, 4 / 14].map((f) => f * w);
      const anaXs = Array.from({ length: 6 }, (_, i) => ((i + 7) / 14) * w);
      return (
        <g>
          {/* Main PCB */}
          <rect width={w} height={h} rx={8} fill="#0c4a46" stroke="#14b8a6" strokeWidth={1.6} />
          <rect x={4} y={4} width={w - 8} height={h - 8} rx={6} fill="none" stroke="#1e786e" strokeWidth={0.8} strokeDasharray="3 3" />
          {/* Mounting holes */}
          {[[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].map(([cx, cy], idx) => (
            <circle key={idx} cx={cx} cy={cy} r={4} fill="#0b1220" stroke="#cbd5e1" strokeWidth={1.2} />
          ))}
          {/* USB Type-B port */}
          <rect x={-5} y={24} width={30} height={34} rx={3} fill="#94a3b8" stroke="#e2e8f0" strokeWidth={1.2} />
          <rect x={2} y={29} width={16} height={24} rx={1.5} fill="#475569" />
          {/* DC barrel jack */}
          <rect x={-3} y={70} width={26} height={24} rx={2} fill="#111827" stroke="#334155" strokeWidth={1} />
          <circle cx={4} cy={82} r={4} fill="#475569" />
          {/* Reset button + 16 MHz crystal */}
          <rect x={34} y={14} width={14} height={14} rx={2} fill="#e2e8f0" stroke="#475569" />
          <circle cx={41} cy={21} r={3.8} fill="#dc2626" />
          <rect x={58} y={32} width={22} height={10} rx={5} fill="#cbd5e1" stroke="#64748b" />
          {/* ATmega328P DIP-28 microcontroller */}
          <rect x={106} y={45} width={116} height={32} rx={3} fill="#0f172a" stroke="#475569" strokeWidth={1.2} />
          <path d="M106,57 A4,4 0 0 1 106,65" fill="#334155" />
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i}>
              <rect x={111 + i * 7.8} y={41} width={3.5} height={4} fill="#cbd5e1" />
              <rect x={111 + i * 7.8} y={77} width={3.5} height={4} fill="#cbd5e1" />
            </g>
          ))}
          <text x={164} y={64} textAnchor="middle" fontSize={8.5} fill="#94a3b8" fontFamily="monospace" letterSpacing={0.6}>ATMEGA328P</text>
          {/* Power & TX/RX/L indicator LEDs */}
          <circle cx={246} cy={38} r={3} fill="#22c55e" />
          <text x={253} y={41} fontSize={7} fill="#a7f3d0" fontFamily="monospace">ON</text>
          <circle cx={246} cy={52} r={3} fill="#f59e0b" />
          <text x={253} y={55} fontSize={7} fill="#fde68a" fontFamily="monospace">L</text>
          {/* Top header socket bar D13..D2 */}
          <rect x={topXs[0] - 9} y={-2} width={topXs[topXs.length - 1] - topXs[0] + 18} height={11} rx={2} fill="#0f172a" stroke="#334155" />
          {topXs.map((px, i) => (
            <rect key={i} x={px - 2.5} y={1} width={5} height={5} rx={0.8} fill="#1e293b" stroke="#64748b" strokeWidth={0.6} />
          ))}
          {/* Bottom power + analog female socket bars */}
          <rect x={pwrXs[0] - 8} y={h - 9} width={pwrXs[pwrXs.length - 1] - pwrXs[0] + 16} height={11} rx={2} fill="#0f172a" stroke="#334155" />
          {pwrXs.map((px, i) => (
            <rect key={i} x={px - 2.5} y={h - 6} width={5} height={5} rx={0.8} fill="#1e293b" stroke="#64748b" strokeWidth={0.6} />
          ))}
          <rect x={anaXs[0] - 8} y={h - 9} width={anaXs[anaXs.length - 1] - anaXs[0] + 16} height={11} rx={2} fill="#0f172a" stroke="#334155" />
          {anaXs.map((px, i) => (
            <rect key={i} x={px - 2.5} y={h - 6} width={5} height={5} rx={0.8} fill="#1e293b" stroke="#64748b" strokeWidth={0.6} />
          ))}
          <text x={68} y={24} fontSize={10.5} fill="#ecfdf5" fontWeight={800} letterSpacing={0.5}>UNO R3</text>
          <text x={246} y={76} fontSize={7} fill="#5eead4" fontFamily="monospace">SunRoot</text>
        </g>
      );
    }
    case "led": {
      const col = LED_COLORS[String(p.props?.color || "red")] || "#ef4444";
      const lvl = out?.on ? out.level : 0;
      return (
        <g>
          {lvl > 0 && <circle cx={w / 2} cy={22} r={30} fill={col} opacity={0.28 * lvl + 0.12} />}
          <path d={`M${w / 2 - 13},39 L${w / 2 - 13},18 A13,13 0 0 1 ${w / 2 + 13},18 L${w / 2 + 13},39 Z`} fill={col} fillOpacity={0.28 + 0.72 * lvl} stroke={col} strokeWidth={2} />
          {/* Internal post & anvil */}
          <path d={`M${w / 2 - 5},39 L${w / 2 - 5},23 L${w / 2 - 1},23`} fill="none" stroke="#94a3b8" strokeWidth={1.6} opacity={0.8} />
          <path d={`M${w / 2 + 5},39 L${w / 2 + 5},22 L${w / 2 + 1},22`} fill="none" stroke="#94a3b8" strokeWidth={1.6} opacity={0.8} />
          {/* Base flange */}
          <rect x={w / 2 - 16} y={37} width={32} height={5} rx={1.5} fill={col} opacity={0.85} />
          <line x1={0.3 * w} y1={42} x2={0.3 * w} y2={h} stroke="#cbd5e1" strokeWidth={2.2} />
          <line x1={0.7 * w} y1={42} x2={0.7 * w} y2={h - 6} stroke="#94a3b8" strokeWidth={2.2} />
          <text x={0.3 * w - 9} y={h - 8} fontSize={10} fill="#ef4444" fontWeight={700}>+</text>
          {out?.fault === "overcurrent" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={11} fill="#ef4444" fontWeight={700}>burning out</text>}
          {out?.fault === "reversed" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={11} fill="#f59e0b" fontWeight={700}>reversed</text>}
        </g>
      );
    }
    case "resistor": {
      const ohms = Number(p.props?.ohms ?? 220);
      const bands = resistorBands(ohms);
      return (
        <g>
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#cbd5e1" strokeWidth={2.4} />
          <path d="M16,5 C20,3 24,3 28,5 L52,5 C56,3 60,3 64,5 L64,19 C60,21 56,21 52,19 L28,19 C24,21 20,21 16,19 Z" fill="#e7c89b" stroke="#9a7342" strokeWidth={1.3} />
          {[25, 33, 41, 51].map((bx, i) => (
            <rect key={bx} x={bx} y={4.8} width={4} height={h - 9.6} rx={0.6} fill={bands[i]} />
          ))}
          <text x={w / 2} y={h + 12} textAnchor="middle" fontSize={10} fill="#94a3b8" fontFamily="monospace">{ohms >= 1000 ? `${ohms / 1000}kΩ` : `${ohms}Ω`}</text>
        </g>
      );
    }
    case "button":
      return (
        <g>
          <line x1={0} y1={h - 10} x2={0} y2={h} stroke="#cbd5e1" strokeWidth={2.5} />
          <line x1={w} y1={h - 10} x2={w} y2={h} stroke="#cbd5e1" strokeWidth={2.5} />
          <rect x={2} y={2} width={w - 4} height={h - 10} rx={5} fill="#cbd5e1" stroke="#64748b" strokeWidth={1.5} />
          <rect x={6} y={6} width={w - 12} height={h - 18} rx={3} fill="#1e293b" />
          {[8, w - 8].flatMap((cx) => [8, h - 14].map((cy) => <circle key={`${cx}_${cy}`} cx={cx} cy={cy} r={2} fill="#94a3b8" />))}
          <circle cx={w / 2} cy={(h - 6) / 2} r={pressed ? 10 : 12} fill={pressed ? "#1d4ed8" : "#2563eb"} stroke="#0f172a" strokeWidth={2} />
        </g>
      );
    case "switch":
      return (
        <g>
          <line x1={0} y1={h - 14} x2={0} y2={h} stroke="#cbd5e1" strokeWidth={2.5} />
          <line x1={w} y1={h - 14} x2={w} y2={h} stroke="#cbd5e1" strokeWidth={2.5} />
          <rect x={2} y={2} width={w - 4} height={h - 14} rx={7} fill="#334155" stroke="#94a3b8" strokeWidth={1.3} />
          <rect x={10} y={(h - 14) / 2 - 5} width={w - 20} height={12} rx={6} fill={pressed ? "#15803d" : "#0f172a"} stroke="#475569" />
          <rect x={pressed ? w - 26 : 12} y={(h - 14) / 2 - 4} width={14} height={10} rx={4} fill="#e2e8f0" stroke="#1e293b" />
          <text x={w / 2} y={h - 16} textAnchor="middle" fontSize={8.5} fill={pressed ? "#86efac" : "#94a3b8"} fontWeight={700}>{pressed ? "ON" : "OFF"}</text>
        </g>
      );
    case "ir_sensor":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#0f172a" stroke="#64748b" strokeWidth={1.4} />
          <rect x={5} y={4} width={w - 10} height={h - 16} rx={3} fill="#1e293b" />
          <circle cx={w * 0.32} cy={18} r={6.5} fill="#020617" stroke="#94a3b8" strokeWidth={1.3} />
          <circle cx={w * 0.68} cy={18} r={6.5} fill={(out?.on ?? pressed) ? "#f87171" : "#e2e8f0"} stroke="#94a3b8" strokeWidth={1.3} />
          <rect x={w / 2 - 5} y={28} width={10} height={8} rx={1} fill="#2563eb" />
          <text x={w / 2} y={10} textAnchor="middle" fontSize={7} fill="#94a3b8" fontFamily="monospace">TCRT5000</text>
        </g>
      );
    case "buzzer":
      return (
        <g>
          {out?.on && [25, 31].map((r) => <circle key={r} cx={w / 2} cy={h / 2 - 4} r={r} fill="none" stroke="#facc15" strokeWidth={2} opacity={0.65} />)}
          <circle cx={w / 2} cy={h / 2 - 4} r={20} fill="#111827" stroke="#64748b" strokeWidth={1.8} />
          <circle cx={w / 2} cy={h / 2 - 4} r={14} fill="#1f2937" stroke="#374151" />
          <circle cx={w / 2} cy={h / 2 - 4} r={4} fill="#030712" stroke="#9ca3af" strokeWidth={0.8} />
          <text x={0.3 * w} y={13} textAnchor="middle" fontSize={9} fill="#ef4444" fontWeight={700}>+</text>
        </g>
      );
    case "potentiometer": {
      const v = Number(p.props?.value ?? 512);
      const deg = (v / 1023) * 270 - 135;
      return (
        <g>
          <rect width={w} height={h - 8} rx={6} fill="#1e3a8a" stroke="#60a5fa" strokeWidth={1.4} />
          <circle cx={w / 2} cy={(h - 8) / 2} r={19} fill="#94a3b8" stroke="#475569" strokeWidth={1.5} />
          <g transform={`rotate(${deg} ${w / 2} ${(h - 8) / 2})`}>
            <circle cx={w / 2} cy={(h - 8) / 2} r={15} fill="#1e293b" stroke="#e2e8f0" strokeWidth={1.5} />
            <line x1={w / 2} y1={(h - 8) / 2} x2={w / 2} y2={(h - 8) / 2 - 13} stroke="#38bdf8" strokeWidth={3} strokeLinecap="round" />
          </g>
          <text x={w / 2} y={h - 11} textAnchor="middle" fontSize={7.5} fill="#bfdbfe" fontFamily="monospace">{v}</text>
        </g>
      );
    }
    case "light_sensor":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#14532d" stroke="#4ade80" strokeWidth={1.4} />
          <circle cx={w / 2} cy={(h - 10) / 2} r={12} fill="#fed7aa" stroke="#ea580c" strokeWidth={1.6} />
          <path d={`M${w / 2 - 7},${(h - 10) / 2 - 4} Q${w / 2},${(h - 10) / 2 - 8} ${w / 2 + 7},${(h - 10) / 2 - 4} Q${w / 2},${(h - 10) / 2} ${w / 2 - 7},${(h - 10) / 2 + 3} Q${w / 2},${(h - 10) / 2 + 7} ${w / 2 + 7},${(h - 10) / 2 + 4}`} fill="none" stroke="#c2410c" strokeWidth={2} strokeLinecap="round" />
          <text x={w / 2} y={h - 11} textAnchor="middle" fontSize={7} fill="#bbf7d0" fontFamily="monospace">LDR</text>
        </g>
      );
    case "temp_sensor":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#7c2d12" stroke="#fdba74" strokeWidth={1.3} />
          <path d={`M${w / 2 - 11},${(h - 8) / 2 + 7} L${w / 2 - 11},${(h - 8) / 2 - 2} A11,9 0 0 1 ${w / 2 + 11},${(h - 8) / 2 - 2} L${w / 2 + 11},${(h - 8) / 2 + 7} Z`} fill="#111827" stroke="#9ca3af" strokeWidth={1.2} />
          <text x={w / 2} y={(h - 8) / 2 + 4} textAnchor="middle" fontSize={6.8} fill="#e2e8f0" fontFamily="monospace">LM35</text>
          <text x={w / 2} y={h - 11} textAnchor="middle" fontSize={6.5} fill="#fed7aa" fontFamily="monospace">TEMP</text>
        </g>
      );
    case "servo":
      return (
        <g>
          <rect x={0} y={8} width={w} height={10} rx={2} fill="#1d4ed8" />
          <rect x={4} y={2} width={w - 8} height={h - 10} rx={4} fill="#2563eb" stroke="#93c5fd" strokeWidth={1.4} />
          <circle cx={w * 0.3} cy={(h - 8) / 2} r={11} fill="#1e40af" stroke="#bfdbfe" strokeWidth={1.2} />
          <g transform={`rotate(${(out?.angle ?? 90) - 90} ${w * 0.3} ${(h - 8) / 2})`}>
            <rect x={w * 0.3 - 4} y={(h - 8) / 2 - 28} width={8} height={32} rx={4} fill="#f8fafc" stroke="#cbd5e1" />
          </g>
          <circle cx={w * 0.3} cy={(h - 8) / 2} r={4.5} fill="#cbd5e1" />
          <text x={w * 0.72} y={(h - 8) / 2 - 2} textAnchor="middle" fontSize={8} fill="#dbeafe" fontWeight={700}>SG90</text>
          <text x={w * 0.72} y={(h - 8) / 2 + 9} textAnchor="middle" fontSize={9.5} fill="#eff6ff" fontFamily="monospace">{Math.round(out?.angle ?? 90)}°</text>
        </g>
      );
    case "motor_driver":
      return (
        <g>
          <rect width={w} height={h} rx={5} fill="#881337" stroke="#fda4af" strokeWidth={1.4} />
          {[14, 21, 28, 35, 42].map((fx) => (
            <rect key={fx} x={fx} y={8} width={4} height={24} rx={1} fill="#111827" stroke="#64748b" strokeWidth={0.7} />
          ))}
          <rect x={0.7 * w} y={2} width={20} height={11} rx={1.5} fill="#16a34a" stroke="#bbf7d0" strokeWidth={0.8} />
          <text x={w * 0.42} y={h - 12} textAnchor="middle" fontSize={8} fill="#ffe4e6" fontWeight={700}>DRIVER</text>
          {out?.fault === "unpowered" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={10} fill="#f59e0b">no power</text>}
        </g>
      );
    case "l298n":
    case "tb6612": {
      const l = p.type === "l298n";
      return (
        <g>
          <rect width={w} height={h} rx={5} fill={l ? "#991b1b" : "#1e3a8a"} stroke={l ? "#fca5a5" : "#93c5fd"} strokeWidth={1.5} />
          {l ? (
            <>
              <rect x={4} y={2} width={30} height={11} rx={1.5} fill="#15803d" stroke="#86efac" strokeWidth={0.8} />
              <rect x={w - 34} y={2} width={30} height={11} rx={1.5} fill="#15803d" stroke="#86efac" strokeWidth={0.8} />
              <rect x={w * 0.34} y={10} width={w * 0.32} height={h * 0.44} rx={2} fill="#111827" stroke="#6b7280" />
              {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={w * 0.37 + i * 7.5} x2={w * 0.37 + i * 7.5} y1={12} y2={10 + h * 0.4} stroke="#374151" strokeWidth={2.5} />)}
            </>
          ) : (
            <rect x={w * 0.36} y={22} width={w * 0.28} height={32} rx={3} fill="#0f172a" stroke="#64748b" />
          )}
          <text x={w / 2} y={h * 0.66} textAnchor="middle" fontSize={10.5} fill="#f8fafc" fontWeight={800} fontFamily="monospace">{l ? "L298N" : "TB6612"}</text>
          <text x={w / 2} y={h * 0.8} textAnchor="middle" fontSize={8} fill="#fecaca">{out?.on ? (out.fault ? out.fault : "driving") : out?.fault || "idle"}</text>
          <text x={w * 0.14} y={22} textAnchor="middle" fontSize={7.5} fill="#fee2e2" fontWeight={700}>OUT A</text>
          <text x={w * 0.86} y={22} textAnchor="middle" fontSize={7.5} fill="#fee2e2" fontWeight={700}>OUT B</text>
        </g>
      );
    }
    case "hc_sr04":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1.5} />
          <circle cx={w * 0.27} cy={(h - 8) / 2} r={14} fill="#cbd5e1" stroke="#475569" strokeWidth={2.5} />
          <circle cx={w * 0.27} cy={(h - 8) / 2} r={8.5} fill="#475569" stroke="#1e293b" />
          <circle cx={w * 0.73} cy={(h - 8) / 2} r={14} fill="#cbd5e1" stroke="#475569" strokeWidth={2.5} />
          <circle cx={w * 0.73} cy={(h - 8) / 2} r={8.5} fill="#475569" stroke="#1e293b" />
          <rect x={w / 2 - 5} y={4} width={10} height={6} rx={3} fill="#e2e8f0" />
          <text x={w / 2} y={h - 11} textAnchor="middle" fontSize={7.5} fill="#dbeafe" fontFamily="monospace">HC-SR04</text>
        </g>
      );
    case "stepper": {
      const rot = out?.rotation ?? 0;
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#1e3a8a" stroke="#93c5fd" strokeWidth={1.4} />
          <circle cx={w * 0.3} cy={(h - 8) / 2} r={26} fill="#cbd5e1" stroke="#64748b" strokeWidth={2} />
          <g transform={`rotate(${rot} ${w * 0.3} ${(h - 8) / 2})`}>
            <rect x={w * 0.3 - 3} y={(h - 8) / 2 - 23} width={6} height={23} rx={3} fill="#1e293b" />
          </g>
          <circle cx={w * 0.3} cy={(h - 8) / 2} r={5} fill="#eab308" />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={w * (0.62 + i * 0.08)} cy={14} r={4} fill={out?.on ? "#fbbf24" : "#334155"} stroke="#0f172a" strokeWidth={0.8} />)}
          <text x={w * 0.76} y={(h - 8) / 2 + 10} textAnchor="middle" fontSize={9.5} fill="#dbeafe" fontFamily="monospace">{Math.round(((rot % 360) + 360) % 360)}°</text>
          <text x={w * 0.76} y={(h - 8) / 2 + 23} textAnchor="middle" fontSize={7} fill="#bfdbfe" fontFamily="monospace">28BYJ-48</text>
        </g>
      );
    }
    case "oled": {
      const lines = out?.text ?? [];
      return (
        <g>
          <rect width={w} height={h - 8} rx={4} fill="#0f172a" stroke="#64748b" strokeWidth={1.4} />
          {[[6, 6], [w - 6, 6], [6, h - 14], [w - 6, h - 14]].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={2} fill="#eab308" />
          ))}
          <rect x={6} y={7} width={w - 12} height={h - 22} rx={2} fill="#020617" stroke="#334155" />
          {lines.slice(0, 8).map((t, i) => <text key={i} x={9} y={16 + i * 5.2} fontSize={5} fill="#38bdf8" fontFamily="monospace">{t}</text>)}
          {!out?.on && <text x={w / 2} y={(h - 8) / 2 + 3} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="monospace">{out?.fault || "OLED 128x64"}</text>}
        </g>
      );
    }
    case "dht11":
      return (
        <g>
          <rect width={w} height={h - 8} rx={4} fill="#1e293b" stroke="#64748b" strokeWidth={1.2} />
          <rect x={5} y={3} width={w - 10} height={h - 17} rx={4} fill="#0284c7" stroke="#bae6fd" strokeWidth={1.2} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c) => <rect key={`${r}_${c}`} x={11 + c * 10} y={8 + r * 8} width={6} height={5} rx={1} fill="#0369a1" />)
          )}
          <text x={w / 2} y={h - 13} textAnchor="middle" fontSize={8} fill="#e0f2fe" fontWeight={700} fontFamily="monospace">DHT11</text>
        </g>
      );
    case "relay":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#0f172a" stroke="#64748b" strokeWidth={1.4} />
          {/* Blue electromechanical SRD-05VDC coil cube */}
          <rect x={8} y={12} width={w * 0.56} height={(h - 8) * 0.68} rx={3} fill="#0284c7" stroke="#7dd3fc" strokeWidth={1.2} />
          <text x={8 + w * 0.28} y={33} textAnchor="middle" fontSize={8} fill="#f0f9ff" fontWeight={800} fontFamily="monospace">SRD-05V</text>
          <text x={8 + w * 0.28} y={45} textAnchor="middle" fontSize={7} fill="#bae6fd">10A RELAY</text>
          {/* Green 3-way screw terminal along top right */}
          <rect x={w * 0.54} y={0} width={w * 0.44} height={11} rx={2} fill="#16a34a" stroke="#86efac" strokeWidth={0.9} />
          {/* Active LED + COM-NO/NC indicator */}
          <circle cx={w * 0.85} cy={26} r={4.5} fill={out?.energised ? "#4ade80" : "#14532d"} stroke="#166534" />
          <text x={w * 0.85} y={42} textAnchor="middle" fontSize={8} fill="#bae6fd" fontFamily="monospace">{out?.energised ? "COM-NO" : "COM-NC"}</text>
        </g>
      );
    case "mpu6050":
      return (
        <g>
          <rect width={w} height={h - 8} rx={5} fill="#1e40af" stroke="#93c5fd" strokeWidth={1.4} />
          <rect x={w / 2 - 11} y={(h - 8) / 2 - 11} width={22} height={22} rx={2} fill="#0f172a" stroke="#64748b" />
          <circle cx={w / 2 - 7} cy={(h - 8) / 2 - 7} r={1.5} fill="#e2e8f0" />
          <path d={`M10,${h - 14} L22,${h - 14} M22,${h - 14} L19,${h - 17} M10,${h - 14} L10,${h - 24} M10,${h - 24} L7,${h - 21}`} stroke="#facc15" strokeWidth={1.3} fill="none" />
          <text x={w / 2} y={10} textAnchor="middle" fontSize={7} fill="#dbeafe" fontFamily="monospace">MPU6050</text>
        </g>
      );
    case "battery": {
      const volts = Number(p.props?.volts ?? 6);
      return (
        <g>
          <rect width={w} height={h - 10} rx={5} fill="#1e293b" stroke="#94a3b8" strokeWidth={1.4} />
          <rect x={3} y={3} width={w - 6} height={14} rx={3} fill="#ca8a04" />
          <line x1={0.25 * w} y1={h - 10} x2={0.25 * w} y2={h} stroke="#ef4444" strokeWidth={3} />
          <line x1={0.75 * w} y1={h - 10} x2={0.75 * w} y2={h} stroke="#94a3b8" strokeWidth={3} />
          <text x={w / 2} y={13} textAnchor="middle" fontSize={8.5} fill="#0f172a" fontWeight={800}>BATTERY</text>
          <text x={w / 2} y={32} textAnchor="middle" fontSize={12} fill="#fde68a" fontWeight={800} fontFamily="monospace">{`${volts} V`}</text>
          {out?.fault === "short" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={10} fill="#ef4444" fontWeight={700}>short circuit</text>}
        </g>
      );
    }
    case "bulb": {
      const lvl = out?.on ? Math.min(1.4, out.level) : 0;
      const burnt = out?.fault === "overvoltage";
      return (
        <g>
          {lvl > 0 && !burnt && <circle cx={w / 2} cy={24} r={30} fill="#fde047" opacity={0.16 + 0.36 * Math.min(1, lvl)} />}
          <circle cx={w / 2} cy={24} r={18} fill={burnt ? "#1f2937" : "#fef9c3"} fillOpacity={burnt ? 0.6 : 0.12 + 0.72 * Math.min(1, lvl)} stroke={lvl > 0 && !burnt ? "#facc15" : "#94a3b8"} strokeWidth={2} />
          <path d={`M${w / 2 - 7},34 L${w / 2 - 4},20 L${w / 2},25 L${w / 2 + 4},20 L${w / 2 + 7},34`} fill="none" stroke={burnt ? "#475569" : lvl > 0 ? "#fffbeb" : "#9ca3af"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <rect x={w / 2 - 9} y={40} width={18} height={10} rx={2} fill="#ca8a04" stroke="#eab308" />
          <line x1={0.3 * w} y1={50} x2={0.3 * w} y2={h} stroke="#9ca3af" strokeWidth={2} />
          <line x1={0.7 * w} y1={50} x2={0.7 * w} y2={h} stroke="#9ca3af" strokeWidth={2} />
          {burnt && <text x={w / 2} y={-6} textAnchor="middle" fontSize={10} fill="#ef4444" fontWeight={700}>burnt out</text>}
          {!burnt && out?.volts !== undefined && Math.abs(out.volts) > 0.05 && (
            <text x={w / 2} y={-5} textAnchor="middle" fontSize={9.5} fill="#fde68a" fontFamily="monospace">{Math.abs(out.volts).toFixed(1)}V</text>
          )}
        </g>
      );
    }
    case "ammeter": {
      const ma = out?.currentMa ?? 0;
      const disp = Math.abs(ma) >= 1000 ? `${(ma / 1000).toFixed(2)} A` : `${Math.round(ma)} mA`;
      return (
        <g>
          <rect width={w} height={h - 10} rx={6} fill="#0f172a" stroke="#14b8a6" strokeWidth={1.6} />
          <rect x={6} y={7} width={w - 12} height={24} rx={3} fill="#042f2e" stroke="#134e4a" />
          <text x={w / 2} y={23} textAnchor="middle" fontSize={11} fill="#5eead4" fontFamily="monospace" fontWeight={700}>{disp}</text>
          <text x={w / 2} y={h - 14} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700}>AMMETER (A)</text>
          <line x1={0.22 * w} y1={h - 10} x2={0.22 * w} y2={h} stroke="#14b8a6" strokeWidth={2} />
          <line x1={0.78 * w} y1={h - 10} x2={0.78 * w} y2={h} stroke="#9ca3af" strokeWidth={2} />
          {out?.fault === "short" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={10} fill="#ef4444" fontWeight={700}>short!</text>}
        </g>
      );
    }
    case "voltmeter": {
      const vv = out?.volts ?? 0;
      return (
        <g>
          <rect width={w} height={h - 10} rx={6} fill="#0f172a" stroke="#f59e0b" strokeWidth={1.6} />
          <rect x={6} y={7} width={w - 12} height={24} rx={3} fill="#451a03" stroke="#78350f" />
          <text x={w / 2} y={23} textAnchor="middle" fontSize={11} fill="#fde68a" fontFamily="monospace" fontWeight={700}>{`${vv.toFixed(2)} V`}</text>
          <text x={w / 2} y={h - 14} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700}>VOLTMETER (V)</text>
          <line x1={0.22 * w} y1={h - 10} x2={0.22 * w} y2={h} stroke="#ef4444" strokeWidth={2} />
          <line x1={0.78 * w} y1={h - 10} x2={0.78 * w} y2={h} stroke="#9ca3af" strokeWidth={2} />
        </g>
      );
    }
    case "dc_motor":
      return (
        <g>
          <rect x={8} y={8} width={w - 16} height={h - 16} rx={8} fill="#ca8a04" stroke="#fde047" strokeWidth={1.4} />
          <circle cx={w / 2} cy={h / 2 - 4} r={16} fill="#334155" stroke="#cbd5e1" strokeWidth={1.5} />
          <g style={out?.on ? { transformOrigin: `${w / 2}px ${h / 2 - 4}px`, animation: `spin ${Math.max(0.15, 1.2 - out.level)}s linear infinite`, animationDirection: out.direction === -1 ? "reverse" : "normal" } : undefined}>
            <line x1={w / 2 - 14} y1={h / 2 - 4} x2={w / 2 + 14} y2={h / 2 - 4} stroke="#f8fafc" strokeWidth={4} strokeLinecap="round" />
            <circle cx={w / 2} cy={h / 2 - 4} r={3.5} fill="#94a3b8" />
          </g>
          {out?.fault === "overcurrent" && <text x={w / 2} y={-6} textAnchor="middle" fontSize={10} fill="#ef4444">needs a driver</text>}
        </g>
      );
    default:
      return <rect width={w} height={h} rx={4} fill="#374151" />;
  }
}
