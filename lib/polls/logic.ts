/** Pure poll logic: validation, closing and result percentages. */

export type PollKind = "poll" | "thisorthat";

export interface PollOptionInput {
  text: string;
  image?: string | null;
}

export const POLL_LIMITS = { question: 200, option: 80, minOptions: 2, maxOptions: 6, maxHours: 24 * 30 };

export type PollCheck = { ok: true; options: PollOptionInput[] } | { ok: false; message: string };

export function validatePollOptions(kind: PollKind, raw: PollOptionInput[]): PollCheck {
  const options = raw
    .map((o) => ({ text: o.text.trim(), image: o.image || null }))
    .filter((o) => o.text.length > 0);
  if (kind === "thisorthat" && options.length !== 2) return { ok: false, message: "This-or-that needs exactly 2 options." };
  if (options.length < POLL_LIMITS.minOptions) return { ok: false, message: "Add at least 2 options." };
  if (options.length > POLL_LIMITS.maxOptions) return { ok: false, message: `At most ${POLL_LIMITS.maxOptions} options.` };
  if (options.some((o) => o.text.length > POLL_LIMITS.option)) return { ok: false, message: `Options can be up to ${POLL_LIMITS.option} characters.` };
  const lower = options.map((o) => o.text.toLowerCase());
  if (new Set(lower).size !== lower.length) return { ok: false, message: "Options must be different." };
  return { ok: true, options };
}

export function isClosed(endsAtMs: number | null | undefined, now: number): boolean {
  return typeof endsAtMs === "number" && endsAtMs <= now;
}

export interface OptionResult {
  id: string;
  votes: number;
  percent: number;
  leading: boolean;
}

/** Whole-number percentages that always add up to 100 (largest remainder), and who is leading. */
export function computeResults(options: { id: string; votes: number }[]): OptionResult[] {
  const total = options.reduce((s, o) => s + Math.max(0, o.votes), 0);
  if (total === 0) return options.map((o) => ({ id: o.id, votes: 0, percent: 0, leading: false }));
  const raw = options.map((o) => (Math.max(0, o.votes) / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - floors[i] })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  const top = Math.max(...options.map((o) => o.votes));
  return options.map((o, i) => ({ id: o.id, votes: o.votes, percent: floors[i], leading: o.votes === top && top > 0 }));
}

export function safeImage(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^(\/|https:\/\/)[^\s]{1,480}$/.test(v) ? v : null;
}
