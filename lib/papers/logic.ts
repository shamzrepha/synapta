import { z } from "zod";

export const MAX_QUESTIONS = 15;
export const MIN_QUESTIONS = 3;

/* ---------- AI output schemas (treated as untrusted) ---------- */

export const aiQuestionSchema = z.object({
  type: z.enum(["mcq", "short"]),
  topic: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string()).optional(),
  answerIndex: z.number().int().optional(),
  modelAnswer: z.string().optional(),
  markScheme: z.string().optional(),
  marks: z.number().optional(),
});

export const aiPaperSchema = z.object({
  title: z.string().optional(),
  questions: z.array(aiQuestionSchema).min(1),
});

export const aiMarkingSchema = z.object({
  results: z.array(z.object({ id: z.string(), awarded: z.number(), feedback: z.string().optional() })),
});

/* ---------- Stored / public shapes ---------- */

export interface StoredQuestion {
  id: string;
  type: "mcq" | "short";
  topic: string;
  prompt: string;
  options: string[]; // mcq only
  answerIndex: number; // mcq only, -1 otherwise
  modelAnswer: string;
  markScheme: string;
  marks: number;
}

export type PublicQuestion = Pick<StoredQuestion, "id" | "type" | "topic" | "prompt" | "options" | "marks">;

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

/** Validates and clamps the model's paper: drops broken questions, caps count and marks, assigns ids. */
export function sanitizePaper(raw: z.infer<typeof aiPaperSchema>, wanted: number): StoredQuestion[] {
  const out: StoredQuestion[] = [];
  const cap = Math.min(Math.max(wanted, 1), MAX_QUESTIONS);
  for (const q of raw.questions) {
    if (out.length >= cap) break;
    const prompt = clip(q.prompt, 1200);
    if (!prompt) continue;
    const topic = clip(q.topic, 60) || "General";
    if (q.type === "mcq") {
      const options = (q.options || []).map((o) => clip(o, 300)).filter(Boolean).slice(0, 5);
      if (options.length < 2 || q.answerIndex === undefined || q.answerIndex < 0 || q.answerIndex >= options.length) continue;
      out.push({
        id: `q${out.length + 1}`,
        type: "mcq",
        topic,
        prompt,
        options,
        answerIndex: q.answerIndex,
        modelAnswer: options[q.answerIndex],
        markScheme: clip(q.markScheme, 600),
        marks: Math.min(2, Math.max(1, Math.round(q.marks || 1))),
      });
    } else {
      out.push({
        id: `q${out.length + 1}`,
        type: "short",
        topic,
        prompt,
        options: [],
        answerIndex: -1,
        modelAnswer: clip(q.modelAnswer, 1500),
        markScheme: clip(q.markScheme, 800),
        marks: Math.min(6, Math.max(2, Math.round(q.marks || 3))),
      });
    }
  }
  return out;
}

export function publicQuestions(qs: StoredQuestion[]): PublicQuestion[] {
  return qs.map(({ id, type, topic, prompt, options, marks }) => ({ id, type, topic, prompt, options, marks }));
}

export function totalMarks(qs: Pick<StoredQuestion, "marks">[]): number {
  return qs.reduce((s, q) => s + q.marks, 0);
}

/* ---------- Marking ---------- */

export interface QuestionResult {
  id: string;
  topic: string;
  awarded: number;
  max: number;
  feedback: string;
  answer: string;
  correctAnswer: string;
}

export interface PaperResult {
  score: number;
  total: number;
  perQuestion: QuestionResult[];
  topics: TopicScore[];
}

export interface TopicScore {
  topic: string;
  awarded: number;
  max: number;
}

const halfMark = (n: number) => Math.round(n * 2) / 2;

export function isBlank(answer: string | undefined): boolean {
  return !answer || !answer.trim();
}

/** Short-answer questions that need the AI (non-blank answers). */
export function questionsNeedingAi(qs: StoredQuestion[], answers: Record<string, string>): StoredQuestion[] {
  return qs.filter((q) => q.type === "short" && !isBlank(answers[q.id]));
}

export function sanitizeMarks(
  raw: z.infer<typeof aiMarkingSchema> | undefined,
  qs: StoredQuestion[]
): Record<string, { awarded: number; feedback: string }> {
  const byId = new Map(qs.map((q) => [q.id, q]));
  const out: Record<string, { awarded: number; feedback: string }> = {};
  for (const r of raw?.results || []) {
    const q = byId.get(r.id);
    if (!q || out[r.id]) continue;
    const awarded = Number.isFinite(r.awarded) ? Math.min(q.marks, Math.max(0, halfMark(r.awarded))) : 0;
    out[r.id] = { awarded, feedback: clip(r.feedback, 600) };
  }
  return out;
}

export function buildResult(
  qs: StoredQuestion[],
  answers: Record<string, string>,
  aiMarks: Record<string, { awarded: number; feedback: string }>
): PaperResult {
  const perQuestion: QuestionResult[] = qs.map((q) => {
    const given = answers[q.id] ?? "";
    if (q.type === "mcq") {
      const idx = Number.parseInt(given, 10);
      const answered = !isBlank(given) && Number.isInteger(idx) && idx >= 0 && idx < q.options.length;
      const correct = answered && idx === q.answerIndex;
      return {
        id: q.id,
        topic: q.topic,
        awarded: correct ? q.marks : 0,
        max: q.marks,
        feedback: !answered ? "No answer given." : correct ? "Correct." : `Not quite. ${q.markScheme}`.trim(),
        answer: answered ? q.options[idx] : "",
        correctAnswer: q.options[q.answerIndex] ?? "",
      };
    }
    if (isBlank(given)) {
      return { id: q.id, topic: q.topic, awarded: 0, max: q.marks, feedback: "No answer given.", answer: "", correctAnswer: q.modelAnswer };
    }
    const m = aiMarks[q.id];
    return {
      id: q.id,
      topic: q.topic,
      awarded: m ? m.awarded : 0,
      max: q.marks,
      feedback: m ? m.feedback || "Marked." : "This answer couldn't be marked automatically.",
      answer: given.slice(0, 2000),
      correctAnswer: q.modelAnswer,
    };
  });
  return {
    score: perQuestion.reduce((s, r) => s + r.awarded, 0),
    total: totalMarks(qs),
    perQuestion,
    topics: aggregateTopics(perQuestion),
  };
}

export function aggregateTopics(rows: Array<{ topic: string; awarded: number; max: number }>): TopicScore[] {
  const map = new Map<string, TopicScore>();
  for (const r of rows) {
    const key = r.topic.trim().toLowerCase();
    const cur = map.get(key) || { topic: r.topic, awarded: 0, max: 0 };
    cur.awarded += r.awarded;
    cur.max += r.max;
    map.set(key, cur);
  }
  return [...map.values()];
}

/** Weakest topics across attempts (lowest percentage first). */
export function weakTopicReport(attempts: Array<{ topics: TopicScore[] }>): Array<TopicScore & { pct: number; weak: boolean }> {
  return aggregateTopics(attempts.flatMap((a) => a.topics))
    .filter((t) => t.max > 0)
    .map((t) => {
      const pct = Math.round((t.awarded / t.max) * 100);
      return { ...t, pct, weak: pct < 60 };
    })
    .sort((a, b) => a.pct - b.pct || b.max - a.max);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
