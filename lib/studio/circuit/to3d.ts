import { CATALOG_BY_TYPE, LED_COLORS, pinDef } from "./catalog";
import type { Circuit } from "./netlist";
import { resolveParts, type DesignSpec, type ResolvedPart } from "../spec";
import { resolveTrack } from "../drive/track";
import { robotBody } from "../drive/robot3d";

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
  stepper: "servo",
};

const S = 0.26; // bench pixels → mm
const TOP = 3; // baseboard thickness

export type Draft = Omit<ResolvedPart, "id" | "name" | "pos"> & { dx: number; dy: number; dz: number; name?: string };

export function modelFor(type: string, props: Record<string, string | number> | undefined, w: number, h: number): Draft[] {
  const box = (size: number[], dy: number, color: string, extra: Partial<Draft> = {}): Draft => ({ shape: "box", size, dx: 0, dy: TOP + dy, dz: 0, color, opacity: 0.35, ...extra });
  switch (type) {
    case "board": {
      // Arduino-style: teal PCB, silver USB socket, black headers along both long edges, a chip
      const bw = w * S;
      const bh = h * S;
      return [
        box([bw, 5, bh], 2.5, "#0e7490", { opacity: 0.3, name: "Board" }),
        box([bw * 0.2, 9, bh * 0.28], 9.5, "#cbd5e1", { dx: -bw / 2 + bw * 0.1, dz: -bh * 0.28, name: "USB socket" }),
        box([bw * 0.72, 5, 2.2], 7.5, "#111827", { dx: bw * 0.06, dz: -bh / 2 + 2.6, name: "Header" }),
        box([bw * 0.72, 5, 2.2], 7.5, "#111827", { dx: bw * 0.06, dz: bh / 2 - 2.6, name: "Header" }),
        box([bw * 0.26, 2.2, bh * 0.2], 6.1, "#0f172a", { dx: bw * 0.1, dz: 0, name: "Microcontroller" }),
      ];
    }
    case "led": {
      // 5 mm LED: rim, body, domed top and two metal leads (leads don't glow)
      const c = LED_COLORS[String(props?.color || "red")] || "#ef4444";
      return [
        { shape: "cylinder", size: [3.4, 6], dx: 0, dy: TOP + 5, dz: 0, color: c, opacity: 0.32 },
        { shape: "sphere", size: [3.4], dx: 0, dy: TOP + 8, dz: 0, color: c, opacity: 0.4 },
        { shape: "cylinder", size: [4.1, 0.9], dx: 0, dy: TOP + 2.2, dz: 0, color: c, opacity: 0.4, name: "Lead" },
        { shape: "cylinder", size: [0.35, 4], dx: -1.3, dy: TOP + 1, dz: 0, color: "#cbd5e1", opacity: 0.8, name: "Lead" },
        { shape: "cylinder", size: [0.35, 3.2], dx: 1.3, dy: TOP + 0.6, dz: 0, color: "#cbd5e1", opacity: 0.8, name: "Lead" },
      ];
    }
    case "resistor": {
      // axial resistor: beige body, colour bands, wire leads
      const band = (dx: number, color: string): Draft => ({ shape: "cylinder", size: [1.95, 0.9], dx, dy: TOP + 3.2, dz: 0, rot: [0, 0, 90], color, opacity: 0.8, name: "Band" });
      return [
        { shape: "capsule", size: [1.8, 6], dx: 0, dy: TOP + 3.2, dz: 0, rot: [0, 0, 90], color: "#d6b88d", opacity: 0.5, name: "Resistor" },
        band(-2.2, "#7c2d12"),
        band(-0.5, "#111827"),
        band(1.2, "#dc2626"),
        band(3, "#ca8a04"),
        { shape: "cylinder", size: [0.3, 14], dx: 0, dy: TOP + 3.2, dz: 0, rot: [0, 0, 90], color: "#cbd5e1", opacity: 0.8, name: "Lead" },
      ];
    }
    case "button":
      return [box([13, 5, 13], 2.5, "#1f2937", { opacity: 0.4 }), { shape: "cylinder", size: [4, 3], dx: 0, dy: TOP + 6.5, dz: 0, color: "#3b82f6", opacity: 0.55, pressShift: [0, -1.6, 0] }];
    case "switch":
      return [box([24, 7, 12], 3.5, "#1f2937", { opacity: 0.4 }), { shape: "box", size: [8, 6, 9], dx: -6, dy: TOP + 9, dz: 0, color: "#e5e7eb", opacity: 0.6, pressShift: [12, 0, 0] }];
    case "potentiometer":
      return [{ shape: "cylinder", size: [6, 6], dx: 0, dy: TOP + 3, dz: 0, color: "#2563eb", opacity: 0.4 }, box([1.6, 2, 7], 7, "#e5e7eb", { opacity: 0.6, dz: 0 })];
    case "light_sensor":
      return [{ shape: "cylinder", size: [4, 3], dx: 0, dy: TOP + 1.5, dz: 0, color: "#fbbf24", opacity: 0.5 }];
    case "temp_sensor":
      return [{ shape: "capsule", size: [2.4, 6], dx: 0, dy: TOP + 5, dz: 0, color: "#38bdf8", opacity: 0.45 }];
    case "ir_sensor":
      return [box([10.2, 7, 5.8], 3.5, "#0f172a", { opacity: 0.5 }), { shape: "cylinder", size: [1.6, 3], dx: -2.5, dy: TOP + 8, dz: 0, color: "#f87171", opacity: 0.6 }];
    case "l298n":
      // 3.4 × 4.3 × 2.7 cm module (Handson datasheet): board, heatsink block and terminals
      return [box([34, 4, 43], 2, "#b91c1c", { opacity: 0.35 }), box([20, 21, 14], 4 + 10.5, "#111827", { opacity: 0.45 })];
    case "tb6612":
      return [box([20, 4, 25], 2, "#1e3a8a", { opacity: 0.4 }), box([8, 2, 8], 5, "#111827", { opacity: 0.5 })];
    case "hc_sr04":
      // 45 × 20 × 15 mm (datasheet): board with two transducer cans
      return [
        box([45, 2, 20], 1, "#1e40af", { opacity: 0.4 }),
        { shape: "cylinder", size: [8, 12], dx: -11, dy: TOP + 8, dz: 0, rot: [90, 0, 0], color: "#cbd5e1", opacity: 0.5 },
        { shape: "cylinder", size: [8, 12], dx: 11, dy: TOP + 8, dz: 0, rot: [90, 0, 0], color: "#cbd5e1", opacity: 0.5 },
      ];
    case "battery":
      return [box([60, 18, 30], 9, "#a16207", { opacity: 0.4, name: "Battery" }), box([60.5, 4, 30.5], 16, "#111827", { opacity: 0.6, name: "Label" }), { shape: "cylinder", size: [3, 3], dx: 31, dy: TOP + 9, dz: 0, rot: [0, 0, 90], color: "#e5e7eb", opacity: 0.8, name: "Terminal" }];
    case "buzzer":
      return [{ shape: "cylinder", size: [6.5, 8], dx: 0, dy: TOP + 4, dz: 0, color: "#374151", opacity: 0.5 }, { shape: "cylinder", size: [1.4, 0.6], dx: 0, dy: TOP + 8.2, dz: 0, color: "#0b0f14", opacity: 0.9, name: "Sound hole" }];
    case "servo":
      return [box([22.2, 22.7, 11.8], 11.35, "#1d4ed8", { opacity: 0.35 }), box([3, 2, 16], 24, "#e5e7eb", { opacity: 0.7 })];
    // The five parts below are illustrative: their datasheets only give drawings as images, so no real body size was read.
    case "stepper":
      return [
        { shape: "cylinder", size: [14, 19], dx: 0, dy: TOP + 9.5, dz: 0, color: "#9ca3af", opacity: 0.4 },
        { shape: "cylinder", size: [2.5, 6], dx: 0, dy: TOP + 22, dz: 0, color: "#e5e7eb", opacity: 0.6 },
        { shape: "box", size: [2, 2, 12], dx: 0, dy: TOP + 25.5, dz: 0, color: "#f8fafc", opacity: 0.8, name: "arm" },
        box([32, 2, 22], 1, "#1d4ed8", { opacity: 0.35, dx: 0, dz: 26, name: "ULN2003 board" }),
      ];
    case "oled":
      return [box([27, 3, 27], 1.5, "#111827", { opacity: 0.45 }), box([22, 1, 11], 3.5, "#38bdf8", { opacity: 0.5, name: "Screen" })];
    case "dht11":
      return [box([12, 15, 5.5], 7.5, "#38bdf8", { opacity: 0.45 })];
    case "relay":
      return [box([40, 3, 26], 1.5, "#1e3a8a", { opacity: 0.4 }), box([19, 16, 15], 11, "#2563eb", { opacity: 0.5, name: "Relay" })];
    case "mpu6050":
      return [box([21, 2, 16], 1, "#1d4ed8", { opacity: 0.4 }), box([4, 1, 4], 2.5, "#111827", { opacity: 0.6, name: "MPU-6050 chip (4 × 4 × 0.9 mm)" })];
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
        bind: LINK_ROLE[p.type] && (p.type !== "stepper" || name === "arm") && name !== "Lead" ? p.id : undefined,
        info: { where: `${def.name} “${p.label || p.id}” from the circuit bench`, fit: def.description },
      } as ResolvedPart);
    });
  }
  return out;
}

/** A 3D wire: a polyline (mm) from one pin to another, lifted over the board so it reads like a jumper lead. */
export interface Wire3D {
  id: string;
  color: string;
  pts: Array<[number, number, number]>;
}

const WIRE_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#14b8a6"];

/**
 * Wires of the circuit, drawn between the 3D models of the parts they connect. Only wires whose two ends are
 * both generated models (laid out like the bench) can be placed; a designer-modelled part has no pin positions.
 */
export function sceneWires(spec: DesignSpec): Wire3D[] {
  const circuit = spec.circuit;
  if (!circuit?.wires.length) return [];
  const { represented, origin } = autoLayout(spec);
  const todo = circuit.parts.filter((p) => !represented.has(p.id) && CATALOG_BY_TYPE[p.type]);
  if (!todo.length) return [];
  const minX = Math.min(...todo.map((p) => p.x));
  const maxX = Math.max(...todo.map((p) => p.x + CATALOG_BY_TYPE[p.type].w));
  const minY = Math.min(...todo.map((p) => p.y));
  const maxY = Math.max(...todo.map((p) => p.y + CATALOG_BY_TYPE[p.type].h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const byId = new Map(todo.map((p) => [p.id, p]));
  const end = (ref: string): [number, number] | null => {
    const dot = ref.indexOf(".");
    const part = byId.get(ref.slice(0, dot));
    const pin = part && pinDef(part.type, ref.slice(dot + 1));
    if (!part || !pin) return null;
    const def = CATALOG_BY_TYPE[part.type];
    return [origin.x + (part.x + pin.x * def.w - cx) * S, origin.z + (part.y + pin.y * def.h - cy) * S];
  };
  const out: Wire3D[] = [];
  circuit.wires.forEach((w, i) => {
    const a = end(w.from);
    const b = end(w.to);
    if (!a || !b) return;
    const lift = TOP + 9 + (i % 5) * 2.2;
    const base = TOP + 4;
    out.push({
      id: w.id,
      color: w.color || WIRE_COLORS[i % WIRE_COLORS.length],
      pts: [
        [a[0], base, a[1]],
        [a[0], lift, a[1]],
        [(a[0] + b[0]) / 2, lift + 3, (a[1] + b[1]) / 2],
        [b[0], lift, b[1]],
        [b[0], base, b[1]],
      ],
    });
  });
  return out;
}

/** Where generated circuit models go: just to the right of everything the designer modelled. */
function autoLayout(spec: DesignSpec, overrides: Record<string, number> = {}): { explicit: ResolvedPart[]; represented: Set<string>; origin: { x: number; z: number } } {
  const explicit = explicitParts(spec, overrides);
  const represented = new Set<string>();
  for (const p of explicit) {
    if (p.bind) represented.add(p.bind);
    if (p.spinWith) represented.add(p.spinWith);
  }
  let origin = { x: 0, z: 0 };
  if (spec.circuit && explicit.length) {
    let right = Math.max(...explicit.map((p) => p.pos[0] + (p.shape === "box" ? p.size[0] / 2 : p.size[0])));
    if (spec.world) {
      const tr = resolveTrack(spec.world);
      right = Math.max(right, ...tr.pts.map((q) => q[0] + tr.width), tr.start.x + 100, tr.arena ? tr.arena.width / 2 + 40 : -Infinity, ...tr.obstacles.map((o) => o.x + (o.shape === "box" ? o.w / 2 : o.r)));
    }
    const todo = spec.circuit.parts.filter((p) => !represented.has(p.id) && CATALOG_BY_TYPE[p.type]);
    const width = todo.length ? (Math.max(...todo.map((p) => p.x + CATALOG_BY_TYPE[p.type].w)) - Math.min(...todo.map((p) => p.x))) * S + 28 : 0;
    origin = { x: right + width / 2 + 60, z: 0 };
  }
  return { explicit, represented, origin };
}

function explicitParts(spec: DesignSpec, overrides: Record<string, number> = {}): ResolvedPart[] {
  let explicit = resolveParts(spec, overrides);
  const robot = spec.robot;
  const auto = !!robot && robot.body === "auto";
  if (robot) {
    // the auto body builds its own wheels; drop any hand-made part that would double them
    if (auto) explicit = explicit.filter((p) => !(p.bind === robot.left || p.bind === robot.right || p.spinWith === robot.left || p.spinWith === robot.right));
    explicit = explicit.map((p) => ({ ...p, moves: true }));
    if (auto) explicit = [...explicit, ...robotBody(robot, spec.circuit)];
  }
  return explicit;
}

/** Everything the 3D view shows: the designer's own parts plus generated models of the rest of the circuit (and the robot's body). */
export function sceneParts(spec: DesignSpec, overrides: Record<string, number> = {}): ResolvedPart[] {
  if (!spec.circuit) return explicitParts(spec, overrides);
  const { explicit, represented, origin } = autoLayout(spec, overrides);
  return [...explicit, ...circuitTo3D(spec.circuit, represented, origin)];
}
