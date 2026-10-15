import { adminDb } from "@/lib/firebase/admin";
import { currentStreak, type DailyStreak } from "./logic";
import type { DailyQuestion } from "./build";

export interface DailyDoc {
  uid: string;
  day: string;
  origin: "mistakes" | "classes";
  questions: DailyQuestion[];
  answers: Record<string, { selectedIndex: number; correct: boolean }>;
  completed: boolean;
  rewarded?: boolean;
  xp?: number;
  createdAt: string;
}

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export const dailyRef = (uid: string, day: string) => adminDb().collection("dailyChallenges").doc(`${uid}_${day}`);
export const streakRef = (uid: string) => adminDb().collection("dailyStreaks").doc(uid);

export async function readStreak(uid: string): Promise<DailyStreak | null> {
  const s = await streakRef(uid).get();
  return s.exists ? (s.data() as DailyStreak) : null;
}

/** Client view: correct answers and explanations are revealed only for questions already answered. */
export function toView(doc: DailyDoc, streak: DailyStreak | null, today: string) {
  const correctCount = Object.values(doc.answers).filter((a) => a.correct).length;
  return {
    day: doc.day,
    origin: doc.origin,
    completed: doc.completed,
    xp: doc.xp ?? 0,
    correctCount,
    streak: currentStreak(streak, today),
    bestStreak: streak?.best ?? 0,
    questions: doc.questions.map((q, i) => {
      const a = doc.answers[String(i)];
      return {
        question: q.question,
        options: q.options,
        topic: q.topic,
        ...(a ? { answered: true, selectedIndex: a.selectedIndex, correct: a.correct, correctIndex: q.correctIndex, explanation: q.explanation } : { answered: false }),
      };
    }),
  };
}
