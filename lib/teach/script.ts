import { z } from "zod";
import { clamp, isValidExpression } from "./math";

/**
 * A lesson script: the AI writes JSON that picks blocks from a fixed set and fills in their numbers. The browser only ever
 * draws those blocks, so no AI-written code runs. Anything that fails validation is dropped or turned into plain text.
 */
const str = (max: number) => z.string().trim().max(max);
const num = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);

const slider = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,7}$/), label: str(30).optional(), min: num(-1000, 1000), max: num(-1000, 1000), value: num(-1000, 1000) });

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), heading: str(80).optional(), bullets: z.array(str(200)).max(6).default([]) }),
  z.object({ type: z.literal("equation_steps"), steps: z.array(z.object({ expr: str(160), note: str(200).default("") })).min(1).max(8) }),
  z.object({ type: z.literal("triangle"), a: num(1, 20).default(3), b: num(1, 20).default(4) }),
  z.object({
    type: z.literal("grapher"),
    expr: str(120),
    xMin: num(-1000, 1000).default(-10),
    xMax: num(-1000, 1000).default(10),
    sliders: z.array(slider).max(3).default([]),
    caption: str(160).optional(),
  }),
  z.object({ type: z.literal("motion"), v0: num(1, 100).default(20), angle: num(5, 85).default(45), g: num(1, 25).default(9.81) }),
  z.object({ type: z.literal("fraction"), num: num(0, 40).default(3), den: num(1, 40).default(4) }),
  z.object({ type: z.literal("timeline"), items: z.array(z.object({ label: str(40), detail: str(200).default("") })).min(2).max(8) }),
  z.object({ type: z.literal("compare"), left: z.object({ title: str(40), points: z.array(str(120)).max(5) }), right: z.object({ title: str(40), points: z.array(str(120)).max(5) }) }),
]);
export type Block = z.output<typeof blockSchema>;

export const sceneSchema = z.object({ narration: str(600), caption: str(120).default(""), block: blockSchema });
export type Scene = z.output<typeof sceneSchema>;

export const lessonScriptSchema = z.object({ title: str(100), scenes: z.array(z.unknown()).min(1).max(14) });
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

function sanitizeBlock(b: Block): Block | null {
  switch (b.type) {
    case "grapher": {
      const names = b.sliders.map((s) => s.key);
      if (!isValidExpression(b.expr, names)) return null;
      let { xMin, xMax } = b;
      if (xMax <= xMin) [xMin, xMax] = [xMin, xMin + 20];
      const sliders = b.sliders.map((s) => {
        const lo = Math.min(s.min, s.max);
        const hi = Math.max(s.min, s.max, lo + 1);
        return { ...s, min: lo, max: hi, value: clamp(s.value, lo, hi) };
      });
      return { ...b, xMin, xMax, sliders };
    }
    case "equation_steps":
      return b.steps.every((s) => s.expr) ? b : null;
    case "triangle":
    case "motion":
      return b;
    case "fraction":
      return { ...b, num: Math.min(b.num, b.den * 2) };
    case "text":
      return b.heading || b.bullets.length ? b : null;
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
- {"type":"grapher","expr":"m*x + c","xMin":-10,"xMax":10,"sliders":[{"key":"m","label":"gradient","min":-5,"max":5,"value":1}]} an interactive graph. expr uses x, slider keys, + - * / ^, parentheses, sqrt abs sin cos tan (degrees), pi.
- {"type":"motion","v0":20,"angle":45,"g":9.81} an animated projectile.
- {"type":"fraction","num":3,"den":4} an interactive fraction bar.
- {"type":"timeline","items":[{"label":"1884","detail":"..."}]} for history, processes and sequences.
- {"type":"compare","left":{"title":"...","points":["..."]},"right":{"title":"...","points":["..."]}} for contrasts.
Pick the block that makes the idea visible and let the learner play with it. Use only facts from the notes provided; do not invent figures. Plain text only inside strings (no markdown).`;
