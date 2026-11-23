/**
 * Pure rules for an exam sprint: pick questions across a class's topics, and suggest how long they should take.
 * Nothing here touches the network, so it is all testable.
 */

export type SprintFormat = "cbt" | "theory" | "mixed";

export interface BankQuestion {
  id: string;
  topic?: string;
  year?: string;
  questionText: string;
  options?: string[];
  correctIndex?: number;
  marks?: number;
  solution?: { cbtBlock?: { stem?: string; options?: string[]; correctIndex?: number; explanation?: string } };
  explanation?: string;
}

export interface SprintItem {
  id: string;
  topic: string;
  kind: "cbt" | "theory";
  /** the text shown, and spoken */
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  marks: number;
  /** a calculation or derivation: the student is told to work it on paper and snap it */
  needsPaper: boolean;
}

/** Minutes a student needs, by kind. Objective questions are about a minute each; a written answer takes much longer. */
export const MIN_PER_CBT = 1;
export const MIN_PER_THEORY = 7;

const PAPER_WORDS = /\b(calculate|compute|determine|find|solve|evaluate|derive|show that|prove|sketch|draw|simplify|expand|differentiate|integrate)\b/i;
export const needsPaper = (text: string): boolean => PAPER_WORDS.test(text);

const topicOf = (q: BankQuestion) => q.topic?.trim() || "Core syllabus";

/** A multiple-choice item only when the question really has options (stored on it, or in its CBT block). Never invents any. */
export function toCbtItem(q: BankQuestion): SprintItem | null {
  const own = Array.isArray(q.options) ? q.options.filter((o) => typeof o === "string" && o.trim()) : [];
  const block = q.solution?.cbtBlock;
  const bOpts = Array.isArray(block?.options) ? block!.options!.filter((o) => typeof o === "string" && o.trim()) : [];
  const useOwn = own.length >= 2;
  const options = useOwn ? own : bOpts.length >= 2 ? bOpts : [];
  if (options.length < 2) return null;
  const ci = useOwn ? q.correctIndex : block?.correctIndex ?? q.correctIndex;
  if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= options.length) return null;
  return {
    id: q.id,
    topic: topicOf(q),
    kind: "cbt",
    stem: (!useOwn && block?.stem) || q.questionText,
    options,
    correctIndex: ci,
    explanation: q.explanation || block?.explanation || "",
    marks: 1,
    needsPaper: false,
  };
}

export function toTheoryItem(q: BankQuestion): SprintItem | null {
  if (!q.questionText || q.questionText.trim().length < 8) return null;
  return {
    id: q.id,
    topic: topicOf(q),
    kind: "theory",
    stem: q.questionText.trim(),
    options: [],
    correctIndex: -1,
    explanation: "",
    marks: typeof q.marks === "number" && q.marks > 0 && q.marks <= 100 ? Math.round(q.marks) : 10,
    needsPaper: needsPaper(q.questionText),
  };
}

export interface SprintConfig {
  format: SprintFormat;
  /** empty means every topic */
  topics: string[];
  count: number;
}

/** What can be asked for this setup, so the screen never offers more than exists. */
export function availableItems(bank: BankQuestion[], format: SprintFormat, topics: string[]): SprintItem[] {
  const want = new Set(topics);
  const out: SprintItem[] = [];
  for (const q of bank) {
    if (want.size && !want.has(topicOf(q))) continue;
    const cbt = format !== "theory" ? toCbtItem(q) : null;
    if (cbt) {
      out.push(cbt);
      continue;
    }
    if (format !== "cbt") {
      const th = toTheoryItem(q);
      // in a mixed sprint a question that already has options is asked as an objective one, not twice
      if (th && !(format === "mixed" && toCbtItem(q))) out.push(th);
    }
  }
  return out;
}

export function topicsOf(bank: BankQuestion[]): Array<{ topic: string; count: number }> {
  const m = new Map<string, number>();
  for (const q of bank) m.set(topicOf(q), (m.get(topicOf(q)) || 0) + 1);
  return Array.from(m, ([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

/** Deterministic shuffle so tests and a "retry the same set" are repeatable. */
function shuffled<T>(a: T[], rand: () => number): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/** Picks `count` items spread across the chosen topics (round robin), so one topic cannot take the whole sprint. */
export function buildSprint(items: SprintItem[], count: number, rand: () => number = Math.random): SprintItem[] {
  const n = Math.max(0, Math.min(Math.floor(count), items.length));
  const byTopic = new Map<string, SprintItem[]>();
  for (const it of shuffled(items, rand)) byTopic.set(it.topic, [...(byTopic.get(it.topic) || []), it]);
  const queues = shuffled(Array.from(byTopic.values()), rand);
  const out: SprintItem[] = [];
  while (out.length < n) {
    let took = false;
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        out.push(next);
        took = true;
        if (out.length >= n) break;
      }
    }
    if (!took) break;
  }
  return out;
}

/** Suggested minutes for a set of questions, rounded up to 5. */
export function recommendedMinutes(items: Array<Pick<SprintItem, "kind">>): number {
  const raw = items.reduce((m, i) => m + (i.kind === "cbt" ? MIN_PER_CBT : MIN_PER_THEORY), 0);
  return Math.max(5, Math.ceil(raw / 5) * 5);
}

/** How many questions fit in a time box, for the "30-minute sprint" presets. */
export function countForMinutes(minutes: number, format: SprintFormat): number {
  const per = format === "theory" ? MIN_PER_THEORY : format === "cbt" ? MIN_PER_CBT : 2.5;
  return Math.max(1, Math.floor(minutes / per));
}

export interface TopicScore {
  topic: string;
  right: number;
  total: number;
  pct: number;
}

/** Per-topic score for the results screen. `scores` is 0..1 per question id (objective: 1 or 0; written: marks awarded / marks). */
export function summarizeSprint(items: SprintItem[], scores: Record<string, number | undefined>) {
  const by = new Map<string, { sum: number; total: number }>();
  let answered = 0;
  let sum = 0;
  for (const it of items) {
    const s = scores[it.id];
    const cur = by.get(it.topic) || { sum: 0, total: 0 };
    cur.total += 1;
    if (typeof s === "number") {
      cur.sum += Math.max(0, Math.min(1, s));
      answered += 1;
      sum += Math.max(0, Math.min(1, s));
    }
    by.set(it.topic, cur);
  }
  const topics: TopicScore[] = Array.from(by, ([topic, v]) => ({ topic, right: Math.round(v.sum * 10) / 10, total: v.total, pct: v.total ? Math.round((v.sum / v.total) * 100) : 0 })).sort((a, b) => a.pct - b.pct);
  return { answered, total: items.length, pct: items.length ? Math.round((sum / items.length) * 100) : 0, topics, weakest: topics.filter((t) => t.pct < 60).map((t) => t.topic) };
}
