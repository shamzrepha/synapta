import { QUALIFY_THRESHOLD } from "./qualify";

export interface ReminderInput {
  streakDays: number;
  freezes: number;
  /** learning points already earned today (0 if none) */
  points: number;
  /** set to false in settings to opt out */
  remindersOn: boolean;
  /** the day the streak was last extended (qualified day, or legacy lastActiveDate) */
  anchor: string | null;
  today: string;
  yesterday: string;
}

/**
 * A reminder goes to learners whose streak is alive (extended yesterday) and who have NOT earned today's
 * learning points yet: that is the only thing that puts the streak at risk. Opening the app does not count.
 */
export function shouldRemind(i: ReminderInput): boolean {
  if (!i.remindersOn || i.streakDays < 2) return false;
  if (i.anchor !== i.yesterday) return false;
  return i.points < QUALIFY_THRESHOLD;
}

export function reminderCopy(i: Pick<ReminderInput, "streakDays" | "freezes" | "points">): { title: string; body: string } {
  const title = `Your ${i.streakDays}-day streak ends at midnight UTC (1 AM in Nigeria)`;
  const progress = i.points > 0 ? `You have ${i.points}/${QUALIFY_THRESHOLD} learning points today. ` : `You have not earned any learning points today. `;
  const how = "About 10 quiz questions, or a mix of flashcards, a lab or lesson pages, keeps it going.";
  const freeze = i.freezes > 0 ? ` If you skip today, a streak freeze will cover you.` : "";
  return { title, body: `${progress}${how}${freeze}` };
}
