import { z } from "zod";
import { evaluate } from "@/lib/studio/expr";
import { readableText } from "@/lib/text/readable";

/**
 * Quest challenges: short, game-like tasks (30 to 60 seconds each) that work for any subject.
 * The AI fills in structured data; our own screens draw and run them, so they always look the same,
 * fit any phone, and are always draggable. Answers stay on the server and are graded there.
 */
export const CHALLENGE_TYPES = ["choose", "number", "slider", "order", "match", "sort"] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

const text = (max: number) => z.string().trim().min(1).max(max).transform(readableText);
const base = { prompt: text(400), hint: text(300), explanation: text(500) };

const choose = z.object({ type: z.literal("choose"), ...base, options: z.array(text(160)).min(2).max(5), answer: z.number().int().min(0) });
const number = z.object({ type: z.literal("number"), ...base, unit: z.string().trim().max(20).optional().default("").transform(readableText), answer: z.number().finite(), tolerance: z.number().finite().min(0) });
const slider = z.object({
  type: z.literal("slider"),
  ...base,
  /** what the learner controls, and what it changes */
  label: text(60),
  unit: z.string().trim().max(20).optional().default("").transform(readableText),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().finite().positive(),
  start: z.number().finite(),
  /** arithmetic over x (see lib/studio/expr): the live result shown while the slider moves */
  expr: z.string().trim().min(1).max(200),
  outLabel: text(60),
  outUnit: z.string().trim().max(20).optional().default("").transform(readableText),
  goalMin: z.number().finite(),
  goalMax: z.number().finite(),
});
const order = z.object({ type: z.literal("order"), ...base, items: z.array(text(140)).min(3).max(6) });
const match = z.object({ type: z.literal("match"), ...base, pairs: z.array(z.object({ left: text(80), right: text(120) })).min(3).max(5) });

const sort = z.object({
  type: z.literal("sort"),
  ...base,
  groups: z.array(z.object({ name: text(60), items: z.array(text(100)).min(1).max(4) })).min(2).max(3),
});

export const challengeSchema = z.discriminatedUnion("type", [choose, number, slider, order, match, sort]);
export type Challenge = z.infer<typeof challengeSchema> & { id: string };

const unique = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase())).size === xs.length;

/** Rejects challenges that cannot be solved or are malformed in ways zod cannot see. */
export function isSolvable(c: z.infer<typeof challengeSchema>): boolean {
  switch (c.type) {
    case "choose":
      return c.answer < c.options.length && unique(c.options);
    case "number":
      return true;
    case "slider": {
      if (!(c.min < c.max) || !(c.goalMin < c.goalMax) || c.start < c.min || c.start > c.max) return false;
      try {
        let reachable = false;
        const steps = Math.min(400, Math.floor((c.max - c.min) / c.step));
        for (let i = 0; i <= steps; i++) {
          const y = evaluate(c.expr, { x: c.min + i * c.step });
          if (!Number.isFinite(y)) return false;
          if (y >= c.goalMin && y <= c.goalMax) reachable = true;
        }
        // already solved at the start would be no challenge
        const atStart = evaluate(c.expr, { x: c.start });
        return reachable && !(atStart >= c.goalMin && atStart <= c.goalMax);
      } catch {
        return false;
      }
    }
    case "order":
      return unique(c.items);
    case "match":
      return unique(c.pairs.map((p) => p.left)) && unique(c.pairs.map((p) => p.right));
    case "sort":
      return unique(c.groups.map((g) => g.name)) && unique(c.groups.flatMap((g) => g.items)) && c.groups.flatMap((g) => g.items).length >= 4;
  }
}

export type Answer =
  | { type: "choose"; index: number }
  | { type: "number"; value: number }
  | { type: "slider"; x: number }
  | { type: "order"; order: string[] }
  | { type: "match"; pairs: Array<{ left: string; right: string }> }
  | { type: "sort"; placed: Array<{ item: string; group: string }> };

export const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choose"), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal("number"), value: z.number().finite() }),
  z.object({ type: z.literal("slider"), x: z.number().finite() }),
  z.object({ type: z.literal("order"), order: z.array(z.string().max(200)).max(8) }),
  z.object({ type: z.literal("match"), pairs: z.array(z.object({ left: z.string().max(200), right: z.string().max(200) })).max(8) }),
  z.object({ type: z.literal("sort"), placed: z.array(z.object({ item: z.string().max(200), group: z.string().max(200) })).max(12) }),
]);

export function gradeChallenge(c: Challenge, a: Answer): boolean {
  if (c.type !== a.type) return false;
  switch (c.type) {
    case "choose":
      return a.type === "choose" && a.index === c.answer;
    case "number":
      return a.type === "number" && Math.abs(a.value - c.answer) <= c.tolerance;
    case "slider": {
      if (a.type !== "slider" || a.x < c.min || a.x > c.max) return false;
      try {
        const y = evaluate(c.expr, { x: a.x });
        return y >= c.goalMin && y <= c.goalMax;
      } catch {
        return false;
      }
    }
    case "order":
      return a.type === "order" && a.order.length === c.items.length && a.order.every((it, i) => it === c.items[i]);
    case "match":
      return a.type === "match" && a.pairs.length === c.pairs.length && c.pairs.every((p) => a.pairs.some((q) => q.left === p.left && q.right === p.right));
    case "sort": {
      if (a.type !== "sort") return false;
      const all = c.groups.flatMap((g) => g.items.map((item) => ({ item, group: g.name })));
      return a.placed.length === all.length && all.every((x) => a.placed.some((q) => q.item === x.item && q.group === x.group));
    }
  }
}

/** The right answer in words, shown after a miss. */
export function solutionText(c: Challenge): string {
  switch (c.type) {
    case "choose":
      return c.options[c.answer];
    case "number":
      return `${c.answer}${c.unit ? " " + c.unit : ""}`;
    case "slider":
      return `${c.outLabel} between ${c.goalMin} and ${c.goalMax}${c.outUnit ? " " + c.outUnit : ""}`;
    case "order":
      return c.items.map((it, i) => `${i + 1}. ${it}`).join("  ");
    case "match":
      return c.pairs.map((p) => `${p.left} → ${p.right}`).join("  ");
    case "sort":
      return c.groups.map((g) => `${g.name}: ${g.items.join(", ")}`).join("  ·  ");
  }
}

export type ClientChallenge =
  | { id: string; type: "choose"; prompt: string; options: string[] }
  | { id: string; type: "number"; prompt: string; unit: string }
  | { id: string; type: "slider"; prompt: string; label: string; unit: string; min: number; max: number; step: number; start: number; expr: string; outLabel: string; outUnit: string; goalMin: number; goalMax: number }
  | { id: string; type: "order"; prompt: string; items: string[] }
  | { id: string; type: "match"; prompt: string; lefts: string[]; rights: string[] }
  | { id: string; type: "sort"; prompt: string; groups: string[]; items: string[] };

function shuffled<T>(xs: T[], rand: () => number, notEqualTo?: T[]): T[] {
  const a = [...xs];
  for (let tries = 0; tries < 6; tries++) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (!notEqualTo || a.some((v, i) => v !== notEqualTo[i])) break;
  }
  return a;
}

/** What the browser gets: everything needed to play, nothing that gives the answer away. */
export function toClientChallenge(c: Challenge, rand: () => number = Math.random): ClientChallenge {
  switch (c.type) {
    case "choose":
      return { id: c.id, type: "choose", prompt: c.prompt, options: c.options };
    case "number":
      return { id: c.id, type: "number", prompt: c.prompt, unit: c.unit };
    case "slider":
      return { id: c.id, type: "slider", prompt: c.prompt, label: c.label, unit: c.unit, min: c.min, max: c.max, step: c.step, start: c.start, expr: c.expr, outLabel: c.outLabel, outUnit: c.outUnit, goalMin: c.goalMin, goalMax: c.goalMax };
    case "order":
      return { id: c.id, type: "order", prompt: c.prompt, items: shuffled(c.items, rand, c.items) };
    case "match":
      return { id: c.id, type: "match", prompt: c.prompt, lefts: c.pairs.map((p) => p.left), rights: shuffled(c.pairs.map((p) => p.right), rand, c.pairs.map((p) => p.right)) };
    case "sort": {
      const flat = c.groups.flatMap((g) => g.items);
      return { id: c.id, type: "sort", prompt: c.prompt, groups: c.groups.map((g) => g.name), items: shuffled(flat, rand, flat) };
    }
  }
}

/** Validates AI output: drops anything unsolvable, numbers the rest. Returns [] when nothing usable remains. */
export function normalizeChallenges(raw: unknown): Challenge[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Challenge[] = [];
  for (const item of list) {
    const parsed = challengeSchema.safeParse(item);
    if (!parsed.success || !isSolvable(parsed.data)) continue;
    out.push({ ...parsed.data, id: `c${out.length + 1}` } as Challenge);
    if (out.length >= 10) break;
  }
  return out;
}
