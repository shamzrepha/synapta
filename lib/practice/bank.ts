import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { executeStructuredAiTask, AiGenerationError } from "@/lib/ai/router";
import { loadKcGroundingContext } from "@/lib/kc/context";
import { buildQuizPrompt, normalizeQuizQuestions, rawQuizResponseSchema, type NormalizedQuizQuestion } from "@/lib/quiz/normalize";
import { flashcardSchema } from "@/lib/gemini/schemas";
import { getFlashcardsPrompt } from "@/lib/gemini/prompts";
import { z } from "zod";

/**
 * Per-topic practice banks: a large, verified question bank and flashcard deck are generated ONCE
 * (by the teacher or the first learner) and stored. Every learner's quiz/deck is then drawn from
 * the bank with no AI call, so 100 students cost the same AI tokens as one.
 */

export const QUIZ_BANK_TARGET = 60;
const QUIZ_BATCHES: Array<{ focus: "conceptual" | "calculation" | "application" | "mixed"; count: number }> = [
  { focus: "conceptual", count: 22 },
  { focus: "calculation", count: 22 },
  { focus: "application", count: 22 },
];
export const FLASHCARD_BANK_TARGET = 40;
const LOCK_MS = 3 * 60 * 1000;

export interface BankQuestion extends NormalizedQuizQuestion {
  id: string;
  focus: string;
}

export interface BankCard {
  id: string;
  front: string;
  back: string;
}

function practiceRef(classId: string, kcId: string, doc: "quizBank" | "flashcardBank") {
  return adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).collection("practice").doc(doc);
}

export function stableId(text: string): string {
  let h = 2166136261;
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function claimLock(ref: FirebaseFirestore.DocumentReference, force: boolean, minSize: number, field: "questions" | "cards") {
  return adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const data = snap.exists ? snap.data()! : null;
    const size = Array.isArray(data?.[field]) ? data![field].length : 0;
    if (!force && size >= minSize) return { claimed: false as const, data };
    const started = data?.generatingAt?.toMillis?.() || 0;
    if (started && Date.now() - started < LOCK_MS) {
      throw new ApiError(409, "BANK_GENERATING", "Practice questions for this topic are being prepared. Try again in a moment.");
    }
    t.set(ref, { generatingAt: Timestamp.now() }, { merge: true });
    return { claimed: true as const, data };
  });
}

/** Returns the topic's question bank, generating it (once) if needed. */
export async function ensureQuizBank(params: {
  classId: string;
  kcId: string;
  userId: string;
  force?: boolean;
  /** Append more questions to an existing bank instead of replacing it */
  extend?: boolean;
}): Promise<BankQuestion[]> {
  const ref = practiceRef(params.classId, params.kcId, "quizBank");
  const lock = await claimLock(ref, !!params.force || !!params.extend, 20, "questions");
  if (!lock.claimed) return lock.data!.questions as BankQuestion[];

  const existing: BankQuestion[] = params.extend && Array.isArray(lock.data?.questions) ? lock.data!.questions : [];
  try {
    const ctx = await loadKcGroundingContext(params.classId, params.kcId, { materialBudget: 12000 });
    const results = await Promise.allSettled(
      QUIZ_BATCHES.map((b) => {
        const prompt = buildQuizPrompt({ kcTitle: ctx.kcTitle, contextText: ctx.contextText, count: b.count, level: ctx.level, focus: b.focus });
        return executeStructuredAiTask({
          task: "structured_spec",
          systemInstruction: prompt.systemInstruction,
          userPrompt: prompt.userPrompt,
          schema: rawQuizResponseSchema,
          userId: params.userId,
          estimatedTokens: 400 * b.count,
          isPrivileged: true,
        }).then((r) => normalizeQuizQuestions(r.data.questions).map((q) => ({ ...q, focus: b.focus })));
      })
    );

    const seen = new Set(existing.map((q) => q.id));
    const bank: BankQuestion[] = [...existing];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const q of r.value) {
        const id = stableId(q.question);
        if (seen.has(id)) continue;
        seen.add(id);
        bank.push({ ...q, id });
      }
    }
    if (bank.length < 5) {
      const firstErr = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw firstErr?.reason instanceof ApiError ? firstErr.reason : new AiGenerationError("Couldn't prepare practice questions for this topic. Please try again.");
    }
    await ref.set({
      questions: bank,
      size: bank.length,
      version: (lock.data?.version || 0) + 1,
      generatedAt: Timestamp.now(),
      generatedBy: params.userId,
      generatingAt: null,
    });
    return bank;
  } catch (err) {
    await ref.set({ generatingAt: null }, { merge: true }).catch(() => null);
    throw err;
  }
}

const lenientCards = z.preprocess(
  (val) => (Array.isArray(val) ? { cards: val } : val && typeof val === "object" && Array.isArray((val as { flashcards?: unknown }).flashcards) ? { cards: (val as { flashcards: unknown }).flashcards } : val),
  z.object({ cards: z.array(z.unknown()).min(1) })
);

/** Returns the topic's flashcard deck, generating it (once) if needed. */
export async function ensureFlashcardBank(params: { classId: string; kcId: string; userId: string; force?: boolean }): Promise<BankCard[]> {
  const ref = practiceRef(params.classId, params.kcId, "flashcardBank");
  const lock = await claimLock(ref, !!params.force, 15, "cards");
  if (!lock.claimed) return lock.data!.cards as BankCard[];
  try {
    const ctx = await loadKcGroundingContext(params.classId, params.kcId, { materialBudget: 10000 });
    const halves = [
      "Focus on definitions, key terms and formulas.",
      "Focus on cause→effect relationships, worked mini-problems and common mistakes.",
    ];
    const results = await Promise.allSettled(
      halves.map((focus) => {
        const p = getFlashcardsPrompt({ kcTitle: ctx.kcTitle, lessonMarkdown: `${ctx.contextText}\n\n${focus}`, count: FLASHCARD_BANK_TARGET / 2 });
        return executeStructuredAiTask({
          task: "structured_spec",
          systemInstruction: p.systemInstruction,
          userPrompt: p.userPrompt,
          schema: lenientCards,
          userId: params.userId,
          estimatedTokens: 3000,
          isPrivileged: true,
        });
      })
    );
    const seen = new Set<string>();
    const cards: BankCard[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const raw of r.value.data.cards) {
        const c = flashcardSchema.safeParse(raw);
        if (!c.success) continue;
        const id = stableId(c.data.front);
        if (seen.has(id)) continue;
        seen.add(id);
        cards.push({ id, front: c.data.front.trim(), back: c.data.back.trim() });
      }
    }
    if (cards.length < 3) {
      const firstErr = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw firstErr?.reason instanceof ApiError ? firstErr.reason : new AiGenerationError("Couldn't prepare flashcards for this topic. Please try again.");
    }
    await ref.set({ cards, size: cards.length, generatedAt: Timestamp.now(), generatedBy: params.userId, generatingAt: null });
    return cards;
  } catch (err) {
    await ref.set({ generatingAt: null }, { merge: true }).catch(() => null);
    throw err;
  }
}

export async function getBankSizes(classId: string, kcId: string): Promise<{ questions: number; cards: number }> {
  const [q, c] = await Promise.all([
    practiceRef(classId, kcId, "quizBank").get(),
    practiceRef(classId, kcId, "flashcardBank").get(),
  ]);
  return { questions: q.data()?.size || 0, cards: c.data()?.size || 0 };
}

/**
 * Picks `count` items for a learner: unseen first (so repeat quizzes feel fresh), then the least
 * recently seen, shuffled. Returns the picks and the updated "seen" list to store.
 */
export function pickForLearner<T extends { id: string }>(
  bank: T[],
  seenIds: string[],
  count: number,
  rng: () => number = Math.random,
  filter?: (item: T) => boolean
): { picked: T[]; seen: string[] } {
  const pool = filter ? bank.filter(filter) : bank;
  const usable = pool.length >= count ? pool : bank;
  const seenSet = new Set(seenIds);
  const shuffle = <X,>(arr: X[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const unseen = shuffle(usable.filter((q) => !seenSet.has(q.id)));
  // Oldest-seen first among already-seen items
  const order = new Map(seenIds.map((id, i) => [id, i]));
  const seenItems = usable.filter((q) => seenSet.has(q.id)).sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  const picked = [...unseen, ...seenItems].slice(0, count);
  const pickedIds = new Set(picked.map((p) => p.id));
  // Move picked to the end (most recent); cap history at the bank size
  const nextSeen = [...seenIds.filter((id) => !pickedIds.has(id)), ...picked.map((p) => p.id)].slice(-bank.length);
  return { picked: shuffle(picked), seen: nextSeen };
}

/** Re-shuffles a question's options for an individual learner, keeping the answer key aligned. */
export function reshuffleOptions(q: NormalizedQuizQuestion, rng: () => number = Math.random): NormalizedQuizQuestion {
  if (q.options.some((o) => /\b(all|none|both) of the above\b/i.test(o))) return q;
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
    distractorMisconceptions: q.distractorMisconceptions ? order.map((i) => q.distractorMisconceptions![i] || "") : undefined,
  };
}
