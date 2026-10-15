import { CATALOG_BY_TYPE, LED_COLORS } from "./catalog";
import type { Circuit } from "./netlist";
import { resolveParts, type DesignSpec, type ResolvedPart } from "../spec";

/**
 * One design, one world. Every part on the circuit bench also exists in the 3D view: parts the
 * designer modelled themselves (linked with `bind`) are used as they are, everything else gets a
 * simple model generated here and laid out like the bench, on a baseboard. The viewer then makes the
 * 3D parts behave from the live circuit (LEDs glow, motors spin, switches can be clicked…).
 */

/** What a linked 3D part does, from the type of the circuit part it is bound to. */
export type LinkRole = "light" | "spin" | "press" | "servo" | "pulse";
export const LINK_ROLE: Record<string, LinkRole> = {
  led: "light",
  dc_motor: "spin",
  button: "press",
  switch: "press",
  servo: "servo",
  buzzer: "pulse",
};

const S = 0.26; // bench pixels → mm
const TOP = 3; // baseboard thickness

type Draft = Omit<ResolvedPart, "id" | "name" | "pos"> & { dx: number; dy: number; dz: number; name?: string };

function modelFor(type: string, props: Record<string, string | number> | undefined, w: number, h: number): Draft[] {
  const box = (size: number[], dy: number, color: string, extra: Partial<Draft> = {}): Draft => ({ shape: "box", size, dx: 0, dy: TOP + dy, dz: 0, color, opacity: 0.35, ...extra });
  switch (type) {
    case "board":
      return [box([w * S, 5, h * S], 2.5, "#0e7490", { opacity: 0.3 })];
    case "led": {
      const c = LED_COLORS[String(props?.color || "red")] || "#ef4444";
      return [
        { shape: "cylinder", size: [3.4, 7], dx: 0, dy: TOP + 3.5, dz: 0, color: c, opacity: 0.32 },
        { shape: "sphere", size: [3.4], dx: 0, dy: TOP + 7, dz: 0, color: c, opacity: 0.4 },
      ];
    }
    case "resistor":
      return [{ shape: "capsule", size: [1.8, 9], dx: 0, dy: TOP + 2.5, dz: 0, rot: [0, 0, 90], color: "#d6b88d", opacity: 0.5 }];
    case "button":
      return [box([13, 5, 13], 2.5, "#1f2937", { opacity: 0.4 }), { shape: "cylinder", size: [4, 3], dx: 0, dy: TOP + 6.5, dz: 0, color: "#3b82f6", opacity: 0.55, pressShift: [0, -1.6, 0] }];
    case "switch":
      return [box([24, 7, 12], 3.5, "#1f2937", { opacity: 0.4 }), { shape: "box", size: [8, 6, 9], dx: -6, dy: TOP + 9, dz: 0, color: "#e5e7eb", opacity: 0.6, pressShift: [12, 0, 0] }];
    case "buzzer":
      return [{ shape: "cylinder", size: [6.5, 8], dx: 0, dy: TOP + 4, dz: 0, color: "#374151", opacity: 0.5 }];
    case "potentiometer":
      return [{ shape: "cylinder", size: [6, 6], dx: 0, dy: TOP + 3, dz: 0, color: "#2563eb", opacity: 0.4 }, box([1.6, 2, 7], 7, "#e5e7eb", { opacity: 0.6, dz: 0 })];
    case "light_sensor":
      return [{ shape: "cylinder", size: [4, 3], dx: 0, dy: TOP + 1.5, dz: 0, color: "#fbbf24", opacity: 0.5 }];
    case "temp_sensor":
      return [{ shape: "capsule", size: [2.4, 6], dx: 0, dy: TOP + 5, dz: 0, color: "#38bdf8", opacity: 0.45 }];
    case "servo":
      return [box([22, 12, 11], 6, "#1d4ed8", { opacity: 0.35 }), box([3, 2, 16], 13, "#e5e7eb", { opacity: 0.7 })];
    case "motor_driver":
      return [box([18, 4, 14], 2, "#7c3aed", { opacity: 0.35 })];
    case "dc_motor":
      return [
        { shape: "cylinder", size: [5, 18], dx: 0, dy: TOP + 5, dz: 0, rot: [0, 0, 90], color: "#fcd34d", opacity: 0.4 },
        { shape: "torus", size: [7, 1.6], dx: 12, dy: TOP + 5, dz: 0, rot: [0, 0, 90], color: "#94a3b8", opacity: 0.6, spinAxis: "x" },
        { shape: "box", size: [1.5, 1.5, 12], dx: 12, dy: TOP + 5, dz: 0, color: "#e2e8f0", opacity: 0.6, spinAxis: "x" },
      ];
    default:
      return [box([10, 6, 10], 3, "#94a3b8")];
  }
}

/** Models for circuit parts the designer hasn't modelled, laid out like the bench on a baseboard centred at (originX, originZ). */
export function circuitTo3D(circuit: Circuit, represented: Set<string>, origin = { x: 0, z: 0 }): ResolvedPart[] {
  const todo = circuit.parts.filter((p) => !represented.has(p.id) && CATALOG_BY_TYPE[p.type]);
  if (!todo.length) return [];
  const rects = todo.map((p) => ({ p, def: CATALOG_BY_TYPE[p.type] }));
  const minX = Math.min(...rects.map((r) => r.p.x));
  const maxX = Math.max(...rects.map((r) => r.p.x + r.def.w));
  const minY = Math.min(...rects.map((r) => r.p.y));
  const maxY = Math.max(...rects.map((r) => r.p.y + r.def.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pad = 14;
  const out: ResolvedPart[] = [
    {
      id: "auto_baseboard",
      name: "Baseboard",
      shape: "box",
      size: [(maxX - minX) * S + pad * 2, TOP, (maxY - minY) * S + pad * 2],
      pos: [origin.x, TOP / 2, origin.z],
      color: "#14532d",
      opacity: 0.18,
      group: "Circuit",
      info: { where: "Everything on the circuit bench, laid out the same way", fit: "A prototyping board in real life." },
    },
  ];
  for (const { p, def } of rects) {
    const X = origin.x + (p.x + def.w / 2 - cx) * S;
    const Z = origin.z + (p.y + def.h / 2 - cy) * S;
    modelFor(p.type, p.props, def.w, def.h).forEach((d, k) => {
      const { dx, dy, dz, name, ...rest } = d;
      out.push({
        ...rest,
        id: `auto_${p.id}_${k}`,
        name: name || `${p.label || p.id}${k ? ` (${k + 1})` : ""}`,
        pos: [X + dx, dy, Z + dz],
        group: "Circuit",
        // linked parts behave from the live circuit: LEDs glow, motors spin, switches can be clicked…
        bind: LINK_ROLE[p.type] ? p.id : undefined,
        info: { where: `${def.name} “${p.label || p.id}” from the circuit bench`, fit: def.description },
      } as ResolvedPart);
    });
  }
  return out;
}

/** Everything the 3D view shows: the designer's own parts plus generated models of the rest of the circuit. */
export function sceneParts(spec: DesignSpec, overrides: Record<string, number> = {}): ResolvedPart[] {
  const explicit = resolveParts(spec, overrides);
  if (!spec.circuit) return explicit;
  const represented = new Set<string>();
  for (const p of explicit) {
    if (p.bind) represented.add(p.bind);
    if (p.spinWith) represented.add(p.spinWith);
  }
  let origin = { x: 0, z: 0 };
  if (explicit.length) {
    const right = Math.max(...explicit.map((p) => p.pos[0] + (p.shape === "box" ? p.size[0] / 2 : p.size[0])));
    const todo = spec.circuit.parts.filter((p) => !represented.has(p.id) && CATALOG_BY_TYPE[p.type]);
    const width = todo.length ? (Math.max(...todo.map((p) => p.x + CATALOG_BY_TYPE[p.type].w)) - Math.min(...todo.map((p) => p.x))) * S + 28 : 0;
    origin = { x: right + width / 2 + 40, z: 0 };
  }
  return [...explicit, ...circuitTo3D(spec.circuit, represented, origin)];
}
