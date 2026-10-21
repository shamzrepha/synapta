/** Pure rules behind the Home "what next" card, so every state is testable without a browser. */

export const MASTERED_AT = 0.95;
export const CONTINUE_BELOW = 0.7;

export interface TopicLite {
  id: string;
  title: string;
}

export type NextAction =
  | { kind: "continue"; kcId: string; title: string; pct: number }
  | { kind: "review"; kcId: string; title: string; pct: number }
  | { kind: "open-class" };

/**
 * The first topic that is not yet solid, in class order. When every topic is solid, suggest the weakest one as a
 * review rather than pointing at topic one again. A class with no topics yet just opens.
 */
export function pickNextAction(kcs: TopicLite[], mastery: Record<string, number>): NextAction {
  if (!kcs.length) return { kind: "open-class" };
  const level = (k: TopicLite) => Math.max(0, Math.min(1, mastery[k.id] ?? 0));
  const open = kcs.find((k) => level(k) < CONTINUE_BELOW);
  if (open) return { kind: "continue", kcId: open.id, title: open.title, pct: Math.round(level(open) * 100) };
  const weakest = kcs.reduce((a, b) => (level(b) < level(a) ? b : a));
  return { kind: "review", kcId: weakest.id, title: weakest.title, pct: Math.round(level(weakest) * 100) };
}

export interface ProgressSummary {
  tracked: number;
  mastered: number;
  /** 0-100, average mastery over the topics the learner has started */
  average: number;
}

/** `pL` values are percentages (0-100), as the dashboard API reports them. */
export function summarizeProgress(points: Array<{ pL: number }>): ProgressSummary {
  const tracked = points.length;
  if (!tracked) return { tracked: 0, mastered: 0, average: 0 };
  const mastered = points.filter((p) => p.pL >= MASTERED_AT * 100).length;
  const average = Math.round(points.reduce((s, p) => s + p.pL, 0) / tracked);
  return { tracked, mastered, average };
}

export type HomeState = "loading" | "error" | "teacher" | "new" | "returning" | "done-today";

/** Which version of the Home card to show. */
export function homeState(i: { loading: boolean; failed: boolean; teacher: boolean; classCount: number; questsAllDone: boolean }): HomeState {
  if (i.loading) return "loading";
  if (i.teacher) return "teacher";
  if (i.failed && i.classCount === 0) return "error";
  if (i.classCount === 0) return "new";
  return i.questsAllDone ? "done-today" : "returning";
}
