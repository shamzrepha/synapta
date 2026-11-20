import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { generateWithFallback } from "@/lib/ai/router";
import { lessonForStudents } from "@/lib/classes/live";
import { clipSource } from "@/lib/study/notes";
import { loadOwnNote, readVersions } from "@/lib/study/notes-store";
import { applyEvidenceIfEnrolled } from "@/lib/evidence/apply";
import { buildMarkerPrompt, buildSetterPrompt } from "./prompts";
import { MIN_EVIDENCE_WORDS, PASS_FRACTION, rawMarkingSchema, rawQuestionSetSchema, type Difficulty, type MarkingResult, type PublicQuestion, type Strictness, type TheoryQuestion } from "./schemas";
import { capAnswer, isMarkable, normalizeQuestions, passed, scoreMarking, zeroResult } from "./scoring";

export interface TheorySource {
  classId?: string;
  kcId?: string;
  noteId?: string;
}

interface ResolvedSource {
  title: string;
  text: string;
  /** one shared cache entry per scope: the class topic, or the owner's note version */
  scope: string;
  isNote: boolean;
}

const MIN_NOTES_CHARS = 200;

/** Finds the notes the questions are set from, enforcing who may see them (class access and the lecturer's publish gate). */
export async function resolveSource(caller: AuthUser, src: TheorySource): Promise<ResolvedSource> {
  if (src.noteId) {
    const { data } = await loadOwnNote(src.noteId, caller.uid);
    const versions = await readVersions(src.noteId);
    const v = versions.find((x) => x.n === data.head) ?? versions[0];
    const text = v?.markdown || "";
    if (text.length < MIN_NOTES_CHARS) throw new ApiError(404, "NOT_READY", "These notes are too short to set questions from.");
    return { title: String(data.title || "My notes"), text, scope: `note:${src.noteId}`, isNote: true };
  }
  const classId = src.classId as string;
  const kcId = src.kcId as string;
  const access = await assertClassAccess(caller, classId, "view");
  const kcSnap = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
  if (!kcSnap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
  const kc = (kcSnap.data() || {}) as Record<string, unknown>;
  // teachers practise from their working copy; students only from what the lecturer has pushed
  const text = access.canMutate ? (typeof kc.lessonMarkdown === "string" ? kc.lessonMarkdown : "") : lessonForStudents(kc);
  if (text.length < MIN_NOTES_CHARS) throw new ApiError(404, "NOT_READY", "This topic's notes aren't published yet, so there is nothing to set questions from.");
  return { title: String(kc.title || "Topic"), text, scope: `kc:${classId}:${kcId}`, isNote: false };
}

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

/** Stable and student-free: the same notes and difficulty always map to the same cached question set. */
export function theoryCacheKey(scope: string, difficulty: Difficulty, text: string): string {
  return `theory_v1_${sha(`${scope}|${difficulty}|${sha(text)}`)}`;
}

export const toPublic = (q: TheoryQuestion): PublicQuestion => ({ id: q.id, command: q.command, question: q.question, marks: q.marks });

/** The shared question set for a topic and difficulty: made once by the AI, then read from the cache. */
export async function getQuestionSet(caller: AuthUser, src: ResolvedSource, difficulty: Difficulty): Promise<{ questions: TheoryQuestion[]; cached: boolean }> {
  const cacheKey = theoryCacheKey(src.scope, difficulty, src.text);
  const cached = (await adminDb().collection("aiCache").doc(cacheKey).get().catch(() => null))?.exists === true;
  const prompt = buildSetterPrompt({ title: src.title, notes: clipSource(src.text, 24_000), difficulty });
  const r = await generateWithFallback({
    task: "theory_set",
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
    schema: rawQuestionSetSchema,
    temperature: 0.5,
    userId: caller.uid,
    cacheKey,
    // shared content: written once in English, no per-learner personalisation
    learnerLanguage: false,
    personalize: false,
    estimatedTokens: 3500,
  });
  const questions = r.data ? normalizeQuestions(r.data.questions) : [];
  if (questions.length === 0) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't set questions. Please try again.");
  return { questions, cached };
}

export interface MarkOutcome {
  result: MarkingResult;
  attemptId: string;
  evidence: { credited: boolean; reason?: string; pLAfter?: number };
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Marks one answer (cheap model, per learner), saves the attempt and, when it is safe to, feeds mastery evidence. */
export async function markAnswer(params: {
  caller: AuthUser;
  src: TheorySource;
  question: TheoryQuestion;
  answer: string;
  difficulty: Difficulty;
  strictness: Strictness;
  /** runs just before the AI call and again after it (plan allowance: check, then record on success) */
  beforeAi?: () => Promise<void>;
  afterAi?: () => Promise<void>;
}): Promise<MarkOutcome> {
  const { caller, question, strictness } = params;
  const answer = capAnswer(params.answer);

  let result: MarkingResult;
  if (!isMarkable(answer)) {
    result = zeroResult(question);
  } else {
    await params.beforeAi?.();
    const prompt = buildMarkerPrompt({ question, answer, strictness });
    const r = await generateWithFallback({
      task: "theory_mark",
      systemInstruction: prompt.systemInstruction,
      userPrompt: prompt.userPrompt,
      schema: rawMarkingSchema,
      temperature: 0.1,
      userId: caller.uid,
      // the answer is this learner's alone: never cached, never personalised with other data
      personalize: false,
      estimatedTokens: 1800,
    });
    if (!r.data) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't mark that answer. Please try again.");
    await params.afterAi?.();
    result = scoreMarking(question, r.data, answer, strictness);
  }

  const today = new Date().toISOString().split("T")[0];
  const db = adminDb();
  const isClass = !!params.src.classId && !!params.src.kcId;

  // Evidence is cautious: class topics only, answers that were really attempted, not lenient mode, once per question per day
  let evidence: MarkOutcome["evidence"] = { credited: false };
  let creditedDay: string | null = null;
  if (!isClass) evidence = { credited: false, reason: "Your own notes don't count toward a class mastery score." };
  else if (strictness === "lenient") evidence = { credited: false, reason: "Lenient practice is for learning, so it doesn't change your mastery score." };
  else if (wordCount(answer) < MIN_EVIDENCE_WORDS) evidence = { credited: false, reason: "Write a fuller answer (about 15 words or more) for it to count toward mastery." };
  else {
    const done = await db.collection("theoryAttempts").where("uid", "==", caller.uid).where("questionId", "==", question.id).where("creditedDay", "==", today).limit(1).get();
    if (!done.empty) evidence = { credited: false, reason: "This question already counted today. Try another." };
    else {
      try {
        const ev = await applyEvidenceIfEnrolled({
          uid: caller.uid,
          classId: params.src.classId as string,
          kcId: params.src.kcId as string,
          activity: "theory",
          correct: passed(result),
          metadata: { questionId: question.id, score: result.score, marks: result.marks, strictness, difficulty: params.difficulty },
        });
        if (ev) {
          evidence = { credited: true, pLAfter: ev.pLAfter };
          creditedDay = today;
        } else evidence = { credited: false, reason: "Join this class to earn progress in it." };
      } catch (e) {
        if (e instanceof ApiError && e.status === 429) evidence = { credited: false, reason: e.message };
        else throw e;
      }
    }
  }

  const ref = db.collection("theoryAttempts").doc();
  await ref.set({
    uid: caller.uid,
    classId: params.src.classId ?? null,
    kcId: params.src.kcId ?? null,
    noteId: params.src.noteId ?? null,
    questionId: question.id,
    question: question.question,
    difficulty: params.difficulty,
    strictness,
    answer,
    score: result.score,
    marks: result.marks,
    passFraction: PASS_FRACTION,
    points: result.points.map((p) => ({ awarded: p.awarded, marks: p.marks, status: p.status })),
    creditedDay,
    createdAt: Timestamp.now(),
  });
  return { result, attemptId: ref.id, evidence };
}
