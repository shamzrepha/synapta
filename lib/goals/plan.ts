import { z } from "zod";
import { addDays, dayDiff } from "@/lib/streak/logic";

export const MAX_MILESTONES = 12;
export const MAX_TASKS_PER_MILESTONE = 7;
export const MAX_TOTAL_TASKS = 60;

/** Structured output the model must return (untrusted: always passed through buildPlan). */
export const AiPlanSchema = z.object({
  milestones: z
    .array(
      z.object({
        title: z.string(),
        tasks: z.array(z.object({ title: z.string() })),
      })
    )
    .min(1),
});
export type AiPlan = z.infer<typeof AiPlanSchema>;

export interface GoalTask {
  id: string;
  milestoneId: string;
  title: string;
  dueDate: string;
  done: boolean;
}
export interface GoalMilestone {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}
export interface GoalPlan {
  milestones: GoalMilestone[];
  tasks: GoalTask[];
}

function clean(s: string, max: number): string {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Inclusive number of days from start to end (>= 1). */
function spanDays(start: string, end: string): number {
  return Math.max(1, dayDiff(start, end) + 1);
}

/** Valid target: not in the past, at most a year away. */
export function validateTargetDate(target: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || Number.isNaN(Date.parse(`${target}T00:00:00Z`))) return "Pick a valid date.";
  if (target < today) return "The target date can't be in the past.";
  if (dayDiff(today, target) > 365) return "Choose a date within the next year.";
  return null;
}

/**
 * Turns clamped model output into a dated plan: one milestone per week-ish window across
 * [start, target], tasks spread evenly through each milestone's window. Deterministic.
 */
export function buildPlan(ai: AiPlan, start: string, target: string): GoalPlan {
  const totalDays = spanDays(start, target);
  const maxByWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const milestonesIn = ai.milestones
    .map((m) => ({
      title: clean(m.title, 100),
      tasks: m.tasks.map((t) => clean(t.title, 140)).filter(Boolean).slice(0, MAX_TASKS_PER_MILESTONE),
    }))
    .filter((m) => m.title && m.tasks.length > 0)
    .slice(0, Math.min(MAX_MILESTONES, maxByWeeks));

  const n = milestonesIn.length;
  const plan: GoalPlan = { milestones: [], tasks: [] };
  if (n === 0) return plan;

  let budget = MAX_TOTAL_TASKS;
  milestonesIn.forEach((m, i) => {
    const offStart = Math.floor((i * totalDays) / n);
    const offEnd = Math.max(offStart, Math.floor(((i + 1) * totalDays) / n) - 1);
    const mid = `m${i + 1}`;
    plan.milestones.push({ id: mid, title: m.title, startDate: addDays(start, offStart), endDate: addDays(start, offEnd) });
    const win = offEnd - offStart + 1;
    const tasks = m.tasks.slice(0, Math.max(0, budget));
    budget -= tasks.length;
    tasks.forEach((title, k) => {
      plan.tasks.push({
        id: `${mid}t${k + 1}`,
        milestoneId: mid,
        title,
        dueDate: addDays(start, offStart + Math.floor(((k + 1) * win - 1) / tasks.length)),
        done: false,
      });
    });
  });
  return plan;
}

/** Fallback when the AI is unavailable: a simple weekly review plan so the feature still works. */
export function fallbackPlan(title: string): AiPlan {
  const t = clean(title, 60) || "your goal";
  return {
    milestones: [
      { title: "Get oriented", tasks: [{ title: `List what ${t} requires` }, { title: "Collect your notes and materials" }, { title: "Pick your first topic" }] },
      { title: "Build understanding", tasks: [{ title: "Study one topic and write a summary" }, { title: "Do a short quiz on it" }, { title: "Review mistakes" }] },
      { title: "Practise and check", tasks: [{ title: "Do a timed practice set" }, { title: "Review weak spots" }, { title: "Teach a friend one idea" }] },
    ],
  };
}

export interface GoalProgress {
  done: number;
  total: number;
  pct: number;
  overdue: number;
  expectedPct: number;
  behind: boolean;
}

export function goalProgress(tasks: readonly GoalTask[], today: string): GoalProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const overdue = tasks.filter((t) => !t.done && t.dueDate < today).length;
  const expected = tasks.filter((t) => t.dueDate <= today).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const expectedPct = total ? Math.round((expected / total) * 100) : 0;
  // Behind: some task is overdue and completion trails the schedule by more than ~15 points
  const behind = overdue > 0 && expectedPct - pct > 15;
  return { done, total, pct, overdue, expectedPct, behind };
}

/**
 * Redistributes the unfinished tasks evenly over today..target (inclusive), keeping their order.
 * Completed tasks are untouched. If the target has passed, everything is due today.
 */
export function replan(tasks: readonly GoalTask[], today: string, target: string): GoalTask[] {
  const remaining = tasks.filter((t) => !t.done);
  const n = remaining.length;
  if (n === 0) return tasks.map((t) => ({ ...t }));
  const days = target >= today ? spanDays(today, target) : 1;
  const newDue = new Map<string, string>();
  remaining.forEach((t, k) => newDue.set(t.id, addDays(today, Math.min(days - 1, Math.floor((k * days) / n)))));
  return tasks.map((t) => (t.done ? { ...t } : { ...t, dueDate: newDue.get(t.id)! }));
}

export function tasksDueOn(tasks: readonly GoalTask[], day: string): GoalTask[] {
  return tasks.filter((t) => !t.done && t.dueDate === day);
}
