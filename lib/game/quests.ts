import type { PlayerStats } from "./badges";

export type QuestMetric = keyof PlayerStats | "xp";

export interface QuestDef {
  id: string;
  title: string;
  metric: QuestMetric;
  target: number;
  rewardXp: number;
  emoji: string;
}

export const QUEST_POOL: QuestDef[] = [
  { id: "quiz_correct_10", title: "Answer 10 quiz questions correctly", metric: "quizCorrect", target: 10, rewardXp: 30, emoji: "🧠" },
  { id: "quiz_any_15", title: "Answer 15 quiz questions", metric: "quizAnswered", target: 15, rewardXp: 25, emoji: "❓" },
  { id: "xp_60", title: "Earn 60 XP from learning", metric: "xp", target: 60, rewardXp: 20, emoji: "⚡" },
  { id: "xp_150", title: "Earn 150 XP from learning", metric: "xp", target: 150, rewardXp: 40, emoji: "💥" },
  { id: "lab_1", title: "Pass a simulation check", metric: "labs", target: 1, rewardXp: 25, emoji: "🧪" },
  { id: "cards_15", title: "Review 15 flashcards", metric: "flashcards", target: 15, rewardXp: 20, emoji: "🃏" },
  { id: "comment_2", title: "Help others: write 2 comments", metric: "comments", target: 2, rewardXp: 15, emoji: "💬" },
  { id: "event_1", title: "Join a challenge", metric: "eventsJoined", target: 1, rewardXp: 20, emoji: "🎯" },
  { id: "post_1", title: "Share something with your class", metric: "posts", target: 1, rewardXp: 10, emoji: "📣" },
];

export function dayIdFor(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Three quests per user per day, chosen deterministically (same set all day, different per person).
 * Always includes one core learning quest so quests push learning, not just clicking.
 */
export function questsForDay(uid: string, dayId: string): QuestDef[] {
  const core = QUEST_POOL.filter((q) => ["quizCorrect", "quizAnswered", "xp", "labs"].includes(q.metric));
  const first = core[hash(`${uid}:${dayId}:core`) % core.length];
  const rest = QUEST_POOL.filter((q) => q.id !== first.id && q.metric !== first.metric)
    .map((q) => ({ q, k: hash(`${uid}:${dayId}:${q.id}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.q);
  const picked = [first];
  for (const q of rest) {
    if (picked.length >= 3) break;
    if (!picked.some((p) => p.metric === q.metric)) picked.push(q);
  }
  return picked;
}
