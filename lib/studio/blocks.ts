import { z } from "zod";

/**
 * Block coding for Maker Studio. A block program is plain data (so the AI can write it, it diffs like
 * everything else, and it can be undone). It compiles to the same Arduino-style JavaScript the raw
 * code editor uses, so blocks, raw code, the circuit and the 3D view all run on one engine.
 */

export type Cond =
  | { kind: "pressed" | "released" | "high" | "low"; pin: number }
  | { kind: "analog"; pin: number; op: ">" | "<"; value: number }
  /** any comparison over your variables, e.g. `light < 300 && pressed == 1` */
  | { kind: "expr"; pin: number; expr: string };

export type Block =
  | { id: string; type: "write"; pin: number; value: "HIGH" | "LOW" }
  | { id: string; type: "pwm"; pin: number; value: number; expr?: string }
  | { id: string; type: "wait"; ms: number; expr?: string }
  | { id: string; type: "tone"; pin: number; hz: number; expr?: string }
  | { id: string; type: "noTone"; pin: number }
  | { id: string; type: "servo"; pin: number; angle: number; expr?: string }
  /** variable = analogRead(pin): what a potentiometer or light sensor says right now (0–1023) */
  | { id: string; type: "readAnalog"; pin: number; name: string }
  /** variable = expression, e.g. `level / 4` */
  | { id: string; type: "set"; name: string; expr: string }
  /** variable = map(source, inLow, inHigh, outLow, outHigh): rescale a reading, e.g. 0–1023 → 0–255 */
  | { id: string; type: "map"; name: string; src: string; inLow: number; inHigh: number; outLow: number; outHigh: number }
  | { id: string; type: "print"; text: string }
  | { id: string; type: "waitUntil"; cond: Cond }
  | { id: string; type: "if"; cond: Cond; then: Block[]; else: Block[] }
  | { id: string; type: "repeat"; times: number; body: Block[] };

export interface BlockProgram {
  /** runs once when started */
  setup: Block[];
  /** runs again and again */
  loop: Block[];
}

const pin = z.number().int().min(2).max(19);
/** variable names and expressions are kept to plain maths so they can only ever become simple C++ */
const varName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,15}$/, "Use letters, digits and _").refine((n) => !RESERVED.has(n), "That name is reserved");
const exprText = z.string().max(80).regex(/^[A-Za-z0-9_\s+\-*/%().,<>=!&|?:]*$/, "Only maths and variable names");
const RESERVED = new Set(["int", "float", "void", "if", "else", "for", "while", "return", "setup", "loop", "HIGH", "LOW", "INPUT", "OUTPUT", "delay", "map", "true", "false", "var", "function", "new", "long", "byte", "bool", "char"]);
const condSchema: z.ZodType<Cond, z.ZodTypeDef, unknown> = z.union([
  z.object({ kind: z.enum(["pressed", "released", "high", "low"]), pin }),
  z.object({ kind: z.literal("analog"), pin, op: z.enum([">", "<"]), value: z.number().min(0).max(1023) }),
  z.object({ kind: z.literal("expr"), pin: pin.default(2), expr: exprText }),
]);

const id = z.string().max(24).default("b");
export const blockSchema: z.ZodType<Block, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ id, type: z.literal("write"), pin, value: z.enum(["HIGH", "LOW"]) }),
    z.object({ id, type: z.literal("pwm"), pin, value: z.number().min(0).max(255), expr: exprText.optional() }),
    z.object({ id, type: z.literal("wait"), ms: z.number().min(0).max(600_000), expr: exprText.optional() }),
    z.object({ id, type: z.literal("tone"), pin, hz: z.number().min(20).max(20000), expr: exprText.optional() }),
    z.object({ id, type: z.literal("noTone"), pin }),
    z.object({ id, type: z.literal("servo"), pin, angle: z.number().min(0).max(180), expr: exprText.optional() }),
    z.object({ id, type: z.literal("readAnalog"), pin: pin.min(14), name: varName }),
    z.object({ id, type: z.literal("set"), name: varName, expr: exprText.min(1) }),
    z.object({ id, type: z.literal("map"), name: varName, src: varName, inLow: z.number().min(-100000).max(100000), inHigh: z.number().min(-100000).max(100000), outLow: z.number().min(-100000).max(100000), outHigh: z.number().min(-100000).max(100000) }),
    z.object({ id, type: z.literal("print"), text: z.string().max(80) }),
    z.object({ id, type: z.literal("waitUntil"), cond: condSchema }),
    z.object({ id, type: z.literal("if"), cond: condSchema, then: z.array(blockSchema).max(40).default([]), else: z.array(blockSchema).max(40).default([]) }),
    z.object({ id, type: z.literal("repeat"), times: z.number().int().min(1).max(100), body: z.array(blockSchema).max(40).default([]) }),
  ])
) as z.ZodType<Block, z.ZodTypeDef, unknown>;

export const blocksSchema = z.object({
  setup: z.array(blockSchema).max(40).default([]),
  loop: z.array(blockSchema).max(60).default([]),
});

export const BLOCK_TYPES: Array<{ type: Block["type"]; label: string }> = [
  { type: "write", label: "Turn pin on / off" },
  { type: "pwm", label: "Set motor / brightness (0–255)" },
  { type: "readAnalog", label: "Read a knob / sensor into a variable" },
  { type: "map", label: "Rescale a variable (map)" },
  { type: "set", label: "Set a variable" },
  { type: "wait", label: "Wait" },
  { type: "if", label: "If … then … else" },
  { type: "waitUntil", label: "Wait until" },
  { type: "repeat", label: "Repeat" },
  { type: "servo", label: "Turn servo" },
  { type: "tone", label: "Play sound" },
  { type: "noTone", label: "Stop sound" },
  { type: "print", label: "Print message" },
];

let counter = 0;
const nid = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newBlock(type: Block["type"]): Block {
  const i = nid();
  switch (type) {
    case "write":
      return { id: i, type, pin: 13, value: "HIGH" };
    case "pwm":
      return { id: i, type, pin: 5, value: 200 };
    case "wait":
      return { id: i, type, ms: 1000 };
    case "readAnalog":
      return { id: i, type, pin: 14, name: "knob" };
    case "set":
      return { id: i, type, name: "level", expr: "knob / 4" };
    case "map":
      return { id: i, type, name: "level", src: "knob", inLow: 0, inHigh: 1023, outLow: 0, outHigh: 255 };
    case "tone":
      return { id: i, type, pin: 8, hz: 440 };
    case "noTone":
      return { id: i, type, pin: 8 };
    case "servo":
      return { id: i, type, pin: 9, angle: 90 };
    case "print":
      return { id: i, type, text: "Hello" };
    case "waitUntil":
      return { id: i, type, cond: { kind: "pressed", pin: 2 } };
    case "if":
      return { id: i, type, cond: { kind: "pressed", pin: 2 }, then: [], else: [] };
    case "repeat":
      return { id: i, type, times: 3, body: [] };
  }
}

export const pinName = (n: number): string => (n >= 14 ? `A${n - 14}` : `D${n}`);
const pinExpr = (n: number): string => (n >= 14 ? `A${n - 14}` : String(n));

function condCode(c: Cond): string {
  switch (c.kind) {
    case "pressed":
    case "low":
      return `digitalRead(${c.pin}) == LOW`;
    case "released":
    case "high":
      return `digitalRead(${c.pin}) == HIGH`;
    case "analog":
      return `analogRead(${pinExpr(c.pin)}) ${c.op} ${Math.round(c.value)}`;
    case "expr":
      return c.expr.trim() || "false";
  }
}

/** Variables the program uses (declared once at the top, like Tinkercad does). */
function variables(list: Block[], out: Set<string>) {
  for (const b of list) {
    if (b.type === "readAnalog" || b.type === "set" || b.type === "map") out.add(b.name);
    if (b.type === "if") {
      variables(b.then, out);
      variables(b.else, out);
    }
    if (b.type === "repeat") variables(b.body, out);
  }
}

function collect(list: Block[], out: Set<number>, ins: Set<number>) {
  for (const b of list) {
    if (b.type === "write" || b.type === "pwm" || b.type === "tone" || b.type === "noTone" || b.type === "servo") out.add(b.pin);
    if (b.type === "if" || b.type === "waitUntil") {
      const c = b.cond;
      if (c.kind !== "analog" && c.kind !== "expr") ins.add(c.pin);
    }
    if (b.type === "if") {
      collect(b.then, out, ins);
      collect(b.else, out, ins);
    }
    if (b.type === "repeat") collect(b.body, out, ins);
  }
}

function emit(list: Block[], depth: number, lines: string[]) {
  const pad = "  ".repeat(depth);
  for (const b of list) {
    switch (b.type) {
      case "write":
        lines.push(`${pad}digitalWrite(${b.pin}, ${b.value});`);
        break;
      case "pwm":
        lines.push(`${pad}analogWrite(${b.pin}, ${b.expr?.trim() ? `constrain(${b.expr.trim()}, 0, 255)` : Math.round(b.value)});`);
        break;
      case "readAnalog":
        lines.push(`${pad}${b.name} = analogRead(${pinExpr(b.pin)});`);
        break;
      case "set":
        lines.push(`${pad}${b.name} = ${b.expr.trim()};`);
        break;
      case "map":
        lines.push(`${pad}${b.name} = map(${b.src}, ${b.inLow}, ${b.inHigh}, ${b.outLow}, ${b.outHigh});`);
        break;
      case "wait":
        lines.push(`${pad}delay(${b.expr?.trim() || Math.round(b.ms)});`);
        break;
      case "tone":
        lines.push(`${pad}tone(${b.pin}, ${b.expr?.trim() || Math.round(b.hz)});`);
        break;
      case "noTone":
        lines.push(`${pad}noTone(${b.pin});`);
        break;
      case "servo":
        lines.push(`${pad}servoWrite(${b.pin}, ${b.expr?.trim() ? `constrain(${b.expr.trim()}, 0, 180)` : Math.round(b.angle)});`);
        break;
      case "print":
        lines.push(`${pad}Serial.println(${JSON.stringify(b.text)});`);
        break;
      case "waitUntil":
        lines.push(`${pad}while (!(${condCode(b.cond)})) { delay(10); }`);
        break;
      case "if":
        lines.push(`${pad}if (${condCode(b.cond)}) {`);
        emit(b.then, depth + 1, lines);
        if (b.else.length) {
          lines.push(`${pad}} else {`);
          emit(b.else, depth + 1, lines);
        }
        lines.push(`${pad}}`);
        break;
      case "repeat":
        lines.push(`${pad}for (int i${depth} = 0; i${depth} < ${b.times}; i${depth}++) {`);
        emit(b.body, depth + 1, lines);
        lines.push(`${pad}}`);
        break;
    }
  }
}

/** Turns a block program into the Arduino C++ sketch the board runtime runs (and a real Uno could). Pin modes are set up for you. */
export function compileBlocks(program: BlockProgram): string {
  const outs = new Set<number>();
  const ins = new Set<number>();
  collect(program.setup, outs, ins);
  collect(program.loop, outs, ins);
  const vars = new Set<string>();
  variables(program.setup, vars);
  variables(program.loop, vars);
  const lines: string[] = [...Array.from(vars).sort().map((v) => `int ${v} = 0;`), ...(vars.size ? [""] : []), "void setup() {"];
  for (const n of Array.from(outs).sort((a, b) => a - b)) lines.push(`  pinMode(${n}, OUTPUT);`);
  for (const n of Array.from(ins).sort((a, b) => a - b)) lines.push(`  pinMode(${n}, INPUT_PULLUP);`);
  emit(program.setup, 1, lines);
  lines.push("}", "", "void loop() {");
  emit(program.loop, 1, lines);
  if (!program.loop.length) lines.push("  ");
  lines.push("}", "");
  return lines.join("\n");
}

export function describeCond(c: Cond): string {
  switch (c.kind) {
    case "pressed":
      return `button on ${pinName(c.pin)} is pressed`;
    case "released":
      return `button on ${pinName(c.pin)} is released`;
    case "high":
      return `${pinName(c.pin)} is HIGH`;
    case "low":
      return `${pinName(c.pin)} is LOW`;
    case "analog":
      return `${pinName(c.pin)} ${c.op} ${c.value}`;
    case "expr":
      return c.expr;
  }
}
