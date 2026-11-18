import { z } from "zod";
import { clamp, isValidExpression } from "./math";
import { isAllowedImageUrl } from "@/lib/images/commons";
import { isBalanced, parseFormula } from "./chem";

/**
 * A lesson script: the AI writes JSON that picks blocks from a fixed set and fills in their numbers. The browser only ever
 * draws those blocks, so no AI-written code runs. Anything that fails validation is dropped or turned into plain text.
 */
const str = (max: number) => z.string().trim().max(max);
const num = (lo: number, hi: number) => z.coerce.number().finite().min(lo).max(hi);
const exprOrNum = z.union([z.coerce.number().finite(), str(80)]);
const vec3 = z.tuple([exprOrNum, exprOrNum, exprOrNum]);

const slider = z.object({
  key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/),
  label: str(40).optional(),
  unit: str(16).optional(),
  min: num(-10000, 10000),
  max: num(-10000, 10000),
  value: num(-10000, 10000),
});

const part3dSchema = z.object({
  shape: z.enum(["box", "sphere", "cylinder", "cone", "torus", "arrow", "ring"]).default("box"),
  label: str(30).optional(),
  color: str(24).default("#4f6df5"),
  emissive: str(24).optional(),
  opacity: z.coerce.number().finite().min(0.1).max(1).default(1),
  metalness: z.coerce.number().finite().min(0).max(1).default(0.25),
  roughness: z.coerce.number().finite().min(0.05).max(1).default(0.45),
  size: z.array(exprOrNum).min(1).max(3).default([1, 1, 1]),
  pos: vec3.default([0, 0, 0]),
  rot: vec3.default([0, 0, 0]),
  spinY: exprOrNum.optional(),
  bobY: exprOrNum.optional(),
});

const readout3dSchema = z.object({
  label: str(36),
  expr: str(100),
  unit: str(16).default(""),
});

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), heading: str(80).optional(), bullets: z.array(str(200)).max(6).default([]) }),
  z.object({ type: z.literal("equation_steps"), steps: z.array(z.object({ expr: str(160), note: str(200).default("") })).min(1).max(8) }),
  z.object({ type: z.literal("triangle"), a: num(1, 20).default(3), b: num(1, 20).default(4) }),
  z.object({
    type: z.literal("grapher"),
    expr: str(120),
    xMin: num(-10000, 10000).default(-10),
    xMax: num(-10000, 10000).default(10),
    sliders: z.array(slider).max(4).default([]),
    caption: str(160).optional(),
  }),
  z.object({
    type: z.literal("artifact3d"),
    title: str(80).default("Interactive 3D Model"),
    preset: z.enum(["custom", "orbit", "pendulum", "wave", "atom", "circuit", "optics", "spring", "lever", "field"]).default("custom"),
    caption: str(160).optional(),
    sliders: z.array(slider).max(4).default([]),
    parts: z.array(part3dSchema).max(16).default([]),
    readouts: z.array(readout3dSchema).max(4).default([]),
  }),
  z.object({ type: z.literal("motion"), v0: num(1, 100).default(20), angle: num(5, 85).default(45), g: num(1, 25).default(9.81) }),
  z.object({ type: z.literal("fraction"), num: num(0, 40).default(3), den: num(1, 40).default(4) }),
  z.object({ type: z.literal("timeline"), items: z.array(z.object({ label: str(40), detail: str(200).default("") })).min(2).max(8) }),
  z.object({
    type: z.literal("figure"),
    /** what to look for ("Arduino Uno board", "plant cell diagram"); the server fetches a real, licensed picture for it */
    query: str(100),
    caption: str(160).default(""),
    /** the named parts shown beside the picture */
    parts: z.array(z.object({ name: str(40), detail: str(160).default("") })).max(8).default([]),
    /** filled in by the server after the AI writes the script; under the key "src" so translation leaves it alone */
    src: z.object({ url: z.string(), page: z.string(), author: z.string(), license: z.string() }).optional(),
  }),
  z.object({ type: z.literal("check"), question: str(240), options: z.array(str(120)).min(2).max(4), answer: z.coerce.number().int().min(0).max(3), explain: str(240).default("") }),
  z.object({ type: z.literal("flow"), steps: z.array(z.object({ label: str(40), detail: str(160).default("") })).min(2).max(7) }),
  z.object({
    type: z.literal("balance"),
    reactants: z.array(z.object({ formula: str(30), coef: num(1, 12) })).min(1).max(4),
    products: z.array(z.object({ formula: str(30), coef: num(1, 12) })).min(1).max(4),
  }),
  z.object({ type: z.literal("compare"), left: z.object({ title: str(40), points: z.array(str(120)).max(5) }), right: z.object({ title: str(40), points: z.array(str(120)).max(5) }) }),
]);
export type Block = z.output<typeof blockSchema>;

export const sceneSchema = z.object({ narration: str(600), caption: str(120).default(""), block: blockSchema });
export type Scene = z.output<typeof sceneSchema>;

export const lessonScriptSchema = z.object({ title: str(100), scenes: z.array(z.unknown()).min(1).max(20) });
export interface LessonScript {
  title: string;
  scenes: Scene[];
}

/** Keeps every scene that is valid and sane, drops the rest, and returns null when nothing usable is left. */
export function parseScript(raw: unknown): LessonScript | null {
  const top = lessonScriptSchema.safeParse(raw);
  if (!top.success) return null;
  const scenes: Scene[] = [];
  for (const s of top.data.scenes) {
    const p = sceneSchema.safeParse(s);
    if (!p.success) continue;
    const fixed = sanitizeBlock(p.data.block);
    if (fixed) scenes.push({ ...p.data, block: fixed });
  }
  return scenes.length ? { title: top.data.title, scenes } : null;
}

function sanitizeSliders<T extends { key: string; label?: string; unit?: string; min: number; max: number; value: number }>(sliders: T[]): T[] {
  return sliders.map((s) => {
    const lo = Math.min(s.min, s.max);
    const hi = Math.max(s.min, s.max, lo + 1);
    return { ...s, min: lo, max: hi, value: clamp(s.value, lo, hi) };
  });
}

function sanitizeBlock(b: Block): Block | null {
  switch (b.type) {
    case "grapher": {
      const names = b.sliders.map((s) => s.key);
      if (!isValidExpression(b.expr, names)) return null;
      let { xMin, xMax } = b;
      if (xMax <= xMin) [xMin, xMax] = [xMin, xMin + 20];
      return { ...b, xMin, xMax, sliders: sanitizeSliders(b.sliders) };
    }
    case "artifact3d": {
      const sliders = sanitizeSliders(b.sliders);
      if (b.preset === "custom" && b.parts.length === 0 && sliders.length === 0) return null;
      // a readout whose formula can't be evaluated would show "NaN" for ever: keep only the ones that work
      const names = sliders.map((s) => s.key);
      return { ...b, sliders, readouts: b.readouts.filter((r) => isValidExpression(r.expr, names)) };
    }
    case "equation_steps": {
      // "$" would end the math block that wraps the step and let the rest render as markdown
      const steps = b.steps.map((s) => ({ ...s, expr: s.expr.replace(/\$/g, "").trim() })).filter((s) => s.expr);
      return steps.length ? { ...b, steps } : null;
    }
    case "triangle":
    case "motion":
      return b;
    case "fraction":
      return { ...b, num: Math.min(b.num, b.den * 2) };
    case "text":
      return b.heading || b.bullets.length ? b : null;
    case "figure":
      return b.src && !isAllowedImageUrl(b.src.url) ? { ...b, src: undefined } : b;
    case "check":
      return b.answer < b.options.length ? b : null;
    case "balance":
      return [...b.reactants, ...b.products].every((t) => parseFormula(t.formula)) && isBalanced(b.reactants, b.products) ? b : null;
    default:
      return b;
  }
}

/** When the AI's script is unusable, teach from the notes themselves: one text scene per heading. Never a blank screen. */
export function fallbackScript(title: string, markdown: string): LessonScript {
  const scenes: Scene[] = [];
  const parts = (markdown || "").split(/^#{2,3}\s+/m).slice(1);
  for (const part of parts.slice(0, 12)) {
    const [head, ...rest] = part.split("\n");
    const lines = rest.map((l) => l.replace(/^[-*]\s+/, "").replace(/[*_`>]/g, "").trim()).filter((l) => l.length > 2).slice(0, 5);
    if (!head.trim() || !lines.length) continue;
    scenes.push({ narration: `${head.trim()}. ${lines.slice(0, 3).join(" ")}`.slice(0, 600), caption: head.trim().slice(0, 120), block: { type: "text", heading: head.trim().slice(0, 80), bullets: lines.map((l) => l.slice(0, 200)) } });
  }
  if (!scenes.length) scenes.push({ narration: title, caption: title, block: { type: "text", heading: title, bullets: [] } });
  return { title, scenes };
}

export const SCRIPT_SYSTEM = `You are a brilliant teacher making a short, animated, interactive lesson as JSON. Return ONLY this JSON:
{"title": "...", "scenes": [{"narration": "...", "caption": "...", "block": {...}}]}
Write 5 to 10 scenes in teaching order: hook, build the idea, let the learner try it, check, recap. "narration" is what you say out loud (1 to 3 short sentences, plain words). "caption" is a short on-screen label.
"block" must be exactly one of these (numbers only, no code):
- {"type":"text","heading":"...","bullets":["..."]} for introductions, definitions and recaps.
- {"type":"equation_steps","steps":[{"expr":"LaTeX only, no $ signs","note":"what we did"}]} reveals a worked solution one line at a time. Use for any step-by-step algebra, arithmetic or derivation.
- {"type":"triangle","a":3,"b":4} an interactive right triangle with squares on its sides (Pythagoras).
- {"type":"artifact3d","title":"...","preset":"custom|pendulum|spring|optics|atom|circuit|lever|orbit|wave|field","sliders":[{"key":"l","label":"length","unit":"m","min":1,"max":5,"value":2}],"parts":[{"shape":"cylinder","color":"#4f6df5","size":[0.15,"l",0.15],"pos":[0,0,0],"rot":[0,0,"0.4*sin(t)"]}],"readouts":[{"label":"Period","expr":"2*pi*sqrt(l/9.81)","unit":"s"}],"caption":"..."} builds an interactive orbitable 3D model! Use it whenever the topic involves physical objects, forces, motion, optics, circuits, atoms/molecules, waves, geometry, levers, orbits, or fields. Part formulas (size, pos, rot, spinY, bobY) and readouts can use slider keys + t (seconds) + sin/cos/sqrt/abs/pi.
- {"type":"grapher","expr":"m*x + c","xMin":-10,"xMax":10,"sliders":[{"key":"m","label":"gradient","min":-5,"max":5,"value":1}]} an interactive 2D graph when a curve or plot is best. expr uses x, slider keys, + - * / ^, parentheses, sqrt abs sin cos tan, pi.
- {"type":"motion","v0":20,"angle":45,"g":9.81} an animated 2D projectile.
- {"type":"fraction","num":3,"den":4} an interactive fraction bar.
- {"type":"timeline","items":[{"label":"1884","detail":"..."}]} for history, processes and sequences.
- {"type":"figure","query":"Arduino Uno board","caption":"...","parts":[{"name":"USB port","detail":"powers and programs the board"}]} a real picture from the internet with its named parts. Use it whenever the learner needs to SEE a real photo, organ, map or diagram. "query" must be a short, specific search phrase in English.
- {"type":"flow","steps":[{"label":"Collect","detail":"..."}]} a process or procedure shown step by step.
- {"type":"balance","reactants":[{"formula":"H2","coef":2},{"formula":"O2","coef":1}],"products":[{"formula":"H2O","coef":2}]} a chemical equation the learner balances; coef is the correct answer. Formulas like Ca(OH)2.
- {"type":"check","question":"...","options":["...","..."],"answer":0,"explain":"..."} one quick question with instant feedback. End every lesson with one.
- {"type":"compare","left":{"title":"...","points":["..."]},"right":{"title":"...","points":["..."]}} for contrasts.
Pick the block that makes the idea visible (preferring "artifact3d" when a 3D model fits best, or 2D interactive blocks like "grapher"/"motion"/"triangle"/"fraction"/"balance" when 2D fits best) so every slider directly moves the visual. Use only facts from the notes provided; do not invent figures. Plain text only inside strings (no markdown).`;
