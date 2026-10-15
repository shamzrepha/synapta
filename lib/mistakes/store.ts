import { adminDb } from "@/lib/firebase/admin";
import { afterWrongAnswer, clip, mistakeKey, type MistakeState } from "./logic";

export interface MistakeDoc {
  id: string;
  uid: string;
  question: string;
  options: string[];
  correctIndex: number;
  correctAnswer: string;
  selectedIndex: number;
  studentAnswer: string;
  explanation: string;
  classId: string | null;
  classTitle: string;
  kcId: string | null;
  topic: string;
  source: "quiz" | "daily";
  wrongCount: number;
  retestCorrect: number;
  mastered: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecordMistakeInput {
  uid: string;
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number;
  explanation?: string;
  classId?: string | null;
  kcId?: string | null;
  topic?: string;
  source: "quiz" | "daily";
}

/** Resolves a readable topic + class title for a quiz question (best effort). */
async function describeTopic(classId?: string | null, kcId?: string | null): Promise<{ classTitle: string; topic: string }> {
  let classTitle = "";
  let topic = "";
  try {
    if (classId) {
      const c = await adminDb().collection("classes").doc(classId).get();
      classTitle = clip(c.data()?.title, 120);
      if (kcId) {
        const k = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
        topic = clip(k.data()?.title, 120);
      }
    }
  } catch {
    // names are optional
  }
  return { classTitle, topic };
}

/**
 * Saves (or reopens) a wrong answer in the student's mistake notebook. Never throws: callers invoke
 * this from quiz routes and it must not be able to break them.
 */
export async function recordMistake(input: RecordMistakeInput): Promise<void> {
  try {
    const options = (input.options || []).map((o) => clip(o, 300)).slice(0, 8);
    const question = clip(input.question, 1000);
    if (!input.uid || !question || options.length < 2) return;
    if (input.correctIndex < 0 || input.correctIndex >= options.length) return;
    if (input.selectedIndex === input.correctIndex) return;

    const id = mistakeKey(input.uid, question);
    const ref = adminDb().collection("mistakes").doc(id);
    const [snap, names] = await Promise.all([
      ref.get(),
      describeTopic(input.classId, input.kcId),
    ]);
    const prev = snap.exists ? (snap.data() as MistakeState & { createdAt?: string }) : null;
    const state = afterWrongAnswer(prev ? { wrongCount: prev.wrongCount || 0, retestCorrect: prev.retestCorrect || 0, mastered: !!prev.mastered } : null);
    const nowIso = new Date().toISOString();
    const doc: Omit<MistakeDoc, "id"> = {
      uid: input.uid,
      question,
      options,
      correctIndex: input.correctIndex,
      correctAnswer: options[input.correctIndex],
      selectedIndex: input.selectedIndex,
      studentAnswer: options[input.selectedIndex] ?? "",
      explanation: clip(input.explanation, 800),
      classId: input.classId || null,
      classTitle: names.classTitle,
      kcId: input.kcId || null,
      topic: clip(input.topic, 120) || names.topic || "General",
      source: input.source,
      ...state,
      createdAt: prev?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await ref.set(doc);
  } catch (err) {
    console.warn("[mistakes] record failed", err instanceof Error ? err.message : err);
  }
}

/** The student's mistakes, newest first (bounded; filtered in memory to avoid composite indexes). */
export async function listMistakes(uid: string): Promise<MistakeDoc[]> {
  const snap = await adminDb().collection("mistakes").where("uid", "==", uid).limit(300).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MistakeDoc, "id">) }))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
