import { z } from "zod";
import { num } from "./expr";
import { blocksSchema } from "./blocks";

/**
 * A Studio design is data, not code: the AI and learners edit this JSON, one shared viewer draws
 * it, the simulators run it, and every change is a commit that can be diffed, reverted or forked.
 *
 * - `parts`: 3D assembly parts (boxes/cylinders/spheres) — sizes and positions may be formulas over `params`
 * - `circuit` + `code`: components on a virtual bench, wires between pins, Arduino-style program
 * - `mechanism`: gear train → drum → load, simulated with gravity
 * - `steps`: the guided build, each step optionally auto-checked
 * - `tests`: behaviour tests for circuits (also used to score challenges)
 */

const numOrExpr = z.union([z.number(), z.string().max(200)]);
const vec3 = z.tuple([numOrExpr, numOrExpr, numOrExpr]);

export const paramSchema = z.object({
  key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,31}$/),
  label: z.string().max(60),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  unit: z.string().max(12).optional(),
});

export const part3dSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(80),
  shape: z.enum(["box", "cylinder", "sphere", "cone", "torus", "capsule", "gear", "tube", "prism"]).default("box"),
  /**
   * box: [w, h, d] · cylinder/cone: [radius, height] · sphere: [radius] · torus: [ring radius, tube radius]
   * capsule: [radius, length] · gear: [pitch radius, thickness] (needs `teeth`) · tube: [outer radius, height, inner radius]
   * prism: [radius, height, sides 3–12]
   */
  size: z.array(numOrExpr).min(1).max(3),
  /** gears: number of teeth */
  teeth: numOrExpr.optional(),
  pos: vec3,
  rot: z.tuple([numOrExpr, numOrExpr, numOrExpr]).optional(),
  color: z.string().max(20).optional(),
  opacity: z.number().min(0.02).max(1).optional(),
  group: z.string().max(40).optional(),
  /**
   * Links this 3D part to a circuit part so they act as one: an LED part glows when the LED is on, a
   * motor part spins, a button/switch part can be pressed by clicking it, a servo part swings, a buzzer shakes.
   */
  bind: z.string().max(24).optional(),
  /** older name for `bind` on spinning parts */
  spinWith: z.string().max(24).optional(),
  spinAxis: z.enum(["x", "y", "z"]).optional(),
  /** turns this many times per motor turn (gears: −driver/driven teeth when meshing; may be a formula) */
  spinRatio: numOrExpr.optional(),
  /** moves with this joint (a gate arm, a lift carriage …): see `joints` */
  joint: z.string().max(24).optional(),
  /** moves by this much (mm) while the linked button/switch is pressed, e.g. a button cap sinks */
  pressShift: z.tuple([z.number(), z.number(), z.number()]).optional(),
  explode: z.tuple([z.number(), z.number(), z.number()]).optional(),
  info: z
    .object({
      where: z.string().max(300).optional(),
      fit: z.string().max(600).optional(),
      cost: z.string().max(60).optional(),
      material: z.string().max(80).optional(),
    })
    .optional(),
});

export const circuitPartSchema = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,23}$/),
  type: z.string().max(30),
  label: z.string().max(40).optional(),
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  props: z.record(z.union([z.string().max(40), z.number()])).optional(),
});

export const wireSchema = z.object({
  id: z.string().max(40),
  /** "partId.pin" */
  from: z.string().max(60),
  to: z.string().max(60),
  color: z.string().max(20).optional(),
});

export const gearStageSchema = z.object({
  driverTeeth: z.number().int().min(6).max(200),
  drivenTeeth: z.number().int().min(6).max(200),
});

export const mechanismSchema = z.object({
  input: z.object({
    kind: z.enum(["motor", "crank"]),
    /** motor: stall torque N·m and no-load speed rpm */
    stallTorque: z.number().positive().max(1000).default(0.5),
    freeRpm: z.number().positive().max(30000).default(3000),
    /** crank: handle radius (m), push force (N) and how fast a person can turn it (rpm) */
    crankRadius: z.number().positive().max(2).default(0.1),
    force: z.number().positive().max(2000).default(40),
    crankRpm: z.number().positive().max(300).default(60),
  }),
  /** gear module in mm (tooth size); all meshing gears share it */
  module: z.number().positive().max(20).default(2),
  stages: z.array(gearStageSchema).max(6),
  efficiencyPerStage: z.number().min(0.3).max(1).default(0.95),
  drumRadius: z.number().positive().max(1).default(0.02),
  pulleyAdvantage: z.number().int().min(1).max(8).default(1),
  load: z.object({ mass: z.number().positive().max(10000) }),
  liftHeight: z.number().positive().max(100).default(1),
  /** a ratchet stops the load falling back when the input can't hold it */
  ratchet: z.boolean().default(true),
});

export const testSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(120),
  durationMs: z.number().int().min(100).max(120_000),
  /** simulated button presses / sensor values */
  inputs: z.array(z.object({ atMs: z.number().int().min(0), part: z.string(), value: z.number() })).max(40).default([]),
  expect: z.union([
    z.object({
      kind: z.literal("sequence"),
      /** output part ids (LEDs, buzzers…) whose on/off pattern is checked */
      parts: z.array(z.string()).min(1).max(8),
      /** each state is a list of 0/1 for `parts`; they must appear in this order */
      states: z.array(z.array(z.union([z.literal(0), z.literal(1)]))).min(1).max(12),
      minMs: z.number().int().min(0).default(200),
      cycles: z.number().int().min(1).max(5).default(1),
    }),
    z.object({
      kind: z.literal("at"),
      checks: z.array(z.object({ atMs: z.number().int().min(0), part: z.string(), on: z.boolean() })).min(1).max(40),
    }),
  ]),
});

/**
 * A wheeled robot in a physics world. Frame: x is the robot's right, z is its front when NEGATIVE
 * (the nose points to −z), y is up, units mm. Wheels sit on the x axis at ±trackWidth/2.
 */
export const robotSchema = z.object({
  wheelRadius: z.number().min(5).max(100).default(21),
  /** distance between the left and right wheel centres */
  trackWidth: z.number().min(30).max(400).default(110),
  /** chassis length (front to back) */
  length: z.number().min(40).max(500).default(150),
  wheelWidth: z.number().min(4).max(60).default(14),
  /** wheel speed at full power, after the gearbox */
  maxRpm: z.number().min(10).max(600).default(180),
  /** circuit motor ids driving the left and right wheels (positive = forward when out1→a, out2→b) */
  left: z.string().max(24),
  right: z.string().max(24),
  /** line/IR sensors: circuit part id and where they sit on the robot (x right, z ahead is negative) */
  sensors: z
    .array(
      z.object({
        id: z.string().max(24),
        x: z.number().min(-300).max(300),
        z: z.number().min(-400).max(400),
        /** "line": floor reflectance (IR line sensor); "distance": ultrasonic range to obstacles (HC-SR04) */
        kind: z.enum(["line", "distance"]).default("line"),
        /** distance sensors: direction relative to the nose, degrees (+ = left) */
        angle: z.number().min(-180).max(180).default(0),
      })
    )
    .max(8)
    .default([]),
  /** "auto" builds the chassis, wheels, caster and parts from these numbers; "custom" uses your own parts */
  body: z.enum(["auto", "custom"]).default("auto"),
});

const obstacleSchema = z.union([
  z.object({ shape: z.literal("box"), x: z.number(), z: z.number(), w: z.number().min(5).max(2000), d: z.number().min(5).max(2000), h: z.number().min(5).max(500).default(80) }),
  z.object({ shape: z.literal("cylinder"), x: z.number(), z: z.number(), r: z.number().min(3).max(500), h: z.number().min(5).max(500).default(80) }),
]);

export const worldSchema = z.object({
  /** walls around the floor, centred on the origin */
  arena: z.object({ width: z.number().min(200).max(6000), depth: z.number().min(200).max(6000) }).optional(),
  obstacles: z.array(obstacleSchema).max(40).default([]),
  track: z
    .object({
    preset: z.enum(["oval", "square", "scurve", "zigzag"]).optional(),
    /** or your own path: [x, z] points in mm */
    points: z.array(z.tuple([z.number(), z.number()])).min(2).max(400).optional(),
    closed: z.boolean().default(true),
    /** line width in mm */
    width: z.number().min(6).max(60).default(18),
    })
    .optional(),
  /** robot start pose; default: on the first track point facing along the track */
  start: z.object({ x: z.number(), z: z.number(), heading: z.number() }).optional(),
});

/**
 * A moving joint driven by the circuit: a motor turns it at a speed (gate, wheel, lift screw) or a
 * servo sets its angle. Parts with `joint: <id>` ride on it. Limits stop it; triggers can press limit
 * switches or feed a position back to the board, so code, circuit and 3D stay one machine.
 */
export const jointSchema = z.object({
  id: z.string().max(24),
  kind: z.enum(["revolute", "prismatic"]),
  /** revolute: the axle direction; prismatic: the direction of travel */
  axis: z.enum(["x", "y", "z"]).default("y"),
  /** revolute: the hinge point (mm); default = centre of the first part on the joint */
  pivot: z.tuple([z.number(), z.number(), z.number()]).optional(),
  /** circuit dc_motor that drives it at a speed… */
  motor: z.string().max(24).optional(),
  /** …or a servo whose angle is the joint angle (revolute: degrees 1:1) */
  servo: z.string().max(24).optional(),
  /** motor speed at 6 V full power: degrees/s (revolute) or mm/s (prismatic); servo: max degrees/s (default 600, from the SG90 datasheet) */
  rate: z.number().min(0.1).max(5000).default(90),
  min: z.number().default(0),
  max: z.number().default(90),
  initial: z.number().default(0),
});

export const triggerSchema = z.discriminatedUnion("kind", [
  /** presses this switch/button while the joint is at its `min` or `max` end */
  z.object({ kind: z.literal("limit"), part: z.string().max(24), joint: z.string().max(24), at: z.enum(["min", "max"]), tolerance: z.number().min(0).max(50).default(1) }),
  /** feeds the joint position (0–1023 across min…max) to a potentiometer-type sensor */
  z.object({ kind: z.literal("position"), part: z.string().max(24), joint: z.string().max(24) }),
]);

export const checkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }),
  z.object({ kind: z.literal("parts"), type: z.string(), min: z.number().int().min(1).default(1) }),
  z.object({ kind: z.literal("wired"), part: z.string() }),
  z.object({ kind: z.literal("noErrors") }),
  z.object({ kind: z.literal("code") }),
  z.object({ kind: z.literal("test"), testId: z.string() }),
  z.object({ kind: z.literal("lifts") }),
  z.object({ kind: z.literal("liftTime"), maxSeconds: z.number().positive() }),
  /** the robot must complete `laps` of the track (or that fraction of an open path) staying on the line `onLine` of the time */
  /** a scripted scenario: set sensors at given times, then check where machine joints are */
  z.object({
    kind: z.literal("scenario"),
    seconds: z.number().min(1).max(120).default(10),
    /** at `atS`, sensor/pot `part` reads `value` (an object at 15 cm, a pot turned to 800 …) */
    sets: z.array(z.object({ atS: z.number().min(0), part: z.string().max(24), value: z.number() })).max(24).default([]),
    /** at `atS`, joint `joint` must be within [min, max] (degrees or mm) */
    expect: z.array(z.object({ atS: z.number().min(0), joint: z.string().max(24), min: z.number().optional(), max: z.number().optional() })).min(1).max(24),
  }),
  /** the robot must roam for `seconds`, covering at least `minDistanceMm`, with at most `maxHits` collisions */
  z.object({ kind: z.literal("roam"), seconds: z.number().min(5).max(180).default(30), minDistanceMm: z.number().min(100).max(100000).default(1500), maxHits: z.number().int().min(0).max(50).default(0) }),
  z.object({ kind: z.literal("drive"), seconds: z.number().min(5).max(180).default(40), laps: z.number().min(0.1).max(10).default(1), onLine: z.number().min(0).max(1).default(0.8) }),
]);

export const stepSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(120),
  detail: z.string().max(1500),
  /** what to search on YouTube for this step */
  videoQuery: z.string().max(120).optional(),
  check: checkSchema.default({ kind: "manual" }),
});

export const designKinds = ["circuit", "mechanism", "assembly"] as const;
export type DesignKind = (typeof designKinds)[number];

export const designSpecSchema = z.object({
  version: z.literal(1).default(1),
  kind: z.enum(designKinds),
  summary: z.string().max(800).default(""),
  params: z.array(paramSchema).max(24).default([]),
  parts: z.array(part3dSchema).max(150).default([]),
  circuit: z
    .object({
      parts: z.array(circuitPartSchema).max(40),
      wires: z.array(wireSchema).max(120),
    })
    .optional(),
  code: z.string().max(20_000).optional(),
  /** block program; when `codeMode` is "blocks" the code is generated from it */
  blocks: blocksSchema.optional(),
  /** the drag-and-snap (Blockly) workspace and the sketch it made; used only while `code` still equals that sketch */
  blockly: z
    .object({ state: z.record(z.unknown()), code: z.string().max(20_000) })
    .refine((b) => JSON.stringify(b.state).length <= 120_000, "That block program is too large")
    .optional(),
  codeMode: z.enum(["blocks", "text"]).optional(),
  mechanism: mechanismSchema.optional(),
  joints: z.array(jointSchema).max(16).default([]),
  triggers: z.array(triggerSchema).max(16).default([]),
  robot: robotSchema.optional(),
  world: worldSchema.optional(),
  steps: z.array(stepSchema).max(30).default([]),
  tests: z.array(testSchema).max(10).default([]),
  notes: z.string().max(3000).optional(),
  /** web research done before the build (what the AI read, with its sources) */
  research: z.object({ notes: z.string().max(4000), sources: z.array(z.object({ title: z.string().max(200), uri: z.string().max(600) })).max(12).default([]) }).optional(),
});

export type DesignSpec = z.output<typeof designSpecSchema>;
export type DesignSpecInput = z.input<typeof designSpecSchema>;
export type Part3D = z.output<typeof part3dSchema>;
export type CircuitPart = z.output<typeof circuitPartSchema>;
export type Wire = z.output<typeof wireSchema>;
export type Mechanism = z.output<typeof mechanismSchema>;
export type Step = z.output<typeof stepSchema>;
export type BehaviorTest = z.output<typeof testSchema>;
export type Joint = z.output<typeof jointSchema>;
export type Trigger = z.output<typeof triggerSchema>;
export type Robot = z.output<typeof robotSchema>;
export type World = z.output<typeof worldSchema>;
export type Param = z.output<typeof paramSchema>;

/** Validates and fills defaults. Throws a readable error. */
export function parseSpec(input: unknown): DesignSpec {
  const r = designSpecSchema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`Invalid design: ${issue.path.join(".") || "root"} — ${issue.message}`);
  }
  return r.data;
}

export function paramValues(spec: Pick<DesignSpec, "params">, overrides: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of spec.params) out[p.key] = Math.min(p.max, Math.max(p.min, overrides[p.key] ?? p.value));
  return out;
}

export interface ResolvedPart extends Omit<Part3D, "size" | "pos" | "rot" | "teeth" | "spinRatio"> {
  spinRatio?: number;
  /** part of the robot: it moves with the robot in the physics world */
  moves?: boolean;
  size: number[];
  pos: [number, number, number];
  rot?: [number, number, number];
  teeth?: number;
}

/** Turns formula sizes/positions into numbers using the current parameter values. */
export function resolveParts(spec: DesignSpec, overrides: Record<string, number> = {}): ResolvedPart[] {
  const vars = paramValues(spec, overrides);
  return spec.parts.map((p) => ({
    ...p,
    size: p.size.map((s) => Math.max(0.1, num(s, vars, 10))),
    pos: [num(p.pos[0], vars), num(p.pos[1], vars), num(p.pos[2], vars)],
    rot: p.rot ? [num(p.rot[0], vars), num(p.rot[1], vars), num(p.rot[2], vars)] : undefined,
    teeth: p.teeth === undefined ? undefined : Math.max(6, Math.min(120, Math.round(num(p.teeth, vars, 20)))),
    spinRatio: p.spinRatio === undefined ? undefined : num(p.spinRatio, vars, 1),
  }));
}

export function emptySpec(kind: DesignKind): DesignSpec {
  return parseSpec({
    kind,
    summary: "",
    circuit: kind === "circuit" ? { parts: [{ id: "board", type: "board", x: 80, y: 120 }], wires: [] } : undefined,
    code: kind === "circuit" ? "void setup() {\n  \n}\n\nvoid loop() {\n  \n}\n" : undefined,
    mechanism:
      kind === "mechanism"
        ? { input: { kind: "motor" }, stages: [{ driverTeeth: 12, drivenTeeth: 36 }], load: { mass: 2 } }
        : undefined,
  });
}

export type Shape = Part3D["shape"];

/** Size fields each shape uses (for editors and validation). */
export const SHAPE_FIELDS: Record<Shape, string[]> = {
  box: ["Width", "Height", "Depth"],
  cylinder: ["Radius", "Height"],
  sphere: ["Radius"],
  cone: ["Radius", "Height"],
  torus: ["Ring radius", "Tube radius"],
  capsule: ["Radius", "Length"],
  gear: ["Pitch radius", "Thickness"],
  tube: ["Outer radius", "Height", "Inner radius"],
  prism: ["Radius", "Height", "Sides"],
};

export const SHAPE_LABELS: Record<Shape, string> = {
  box: "Box",
  cylinder: "Cylinder",
  sphere: "Sphere",
  cone: "Cone",
  torus: "Ring (torus)",
  capsule: "Capsule",
  gear: "Gear",
  tube: "Tube / pipe",
  prism: "Prism",
};

/** Sensible starting size for a newly added shape (mm). */
export function defaultSize(shape: Shape): number[] {
  switch (shape) {
    case "box":
      return [60, 40, 60];
    case "cylinder":
      return [25, 50];
    case "sphere":
      return [30];
    case "cone":
      return [30, 60];
    case "torus":
      return [30, 8];
    case "capsule":
      return [15, 60];
    case "gear":
      return [30, 10];
    case "tube":
      return [25, 60, 18];
    case "prism":
      return [30, 40, 6];
  }
}
