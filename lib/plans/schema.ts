import { z } from "zod";

const s = (max: number) => z.string().trim().max(max);

export const ActivitySchema = z.object({
  title: s(120).min(1),
  minutes: z.number(),
  description: s(600),
});

export const ExitQuestionSchema = z.object({
  question: s(300).min(1),
  options: z.array(s(160)).min(2).max(5),
  answerIndex: z.number().int().min(0),
  explanation: s(300).optional().default(""),
});

export const LessonSchema = z.object({
  title: s(140).min(1),
  objectives: z.array(s(240)).min(1).max(8),
  activities: z.array(ActivitySchema).min(1).max(10),
  materials: z.array(s(160)).max(15).default([]),
  differentiation: z.object({
    support: s(500).default(""),
    extension: s(500).default(""),
  }),
  exitTicket: z.array(ExitQuestionSchema).min(1).max(6),
});

export type Lesson = z.output<typeof LessonSchema>;

/** What the model must return for a whole plan. */
export const GeneratedPlanSchema = z.object({
  title: s(140).min(1),
  lessons: z.array(LessonSchema).min(1).max(20),
});
export type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;

/** What the model returns when regenerating one lesson. */
export const GeneratedLessonSchema = z.object({ lesson: LessonSchema });

/**
 * Makes activity minutes whole numbers >= 1 that add up exactly to `durationMin`.
 * Model arithmetic is unreliable, so we always rescale.
 */
export function fitActivityMinutes<T extends { minutes: number }>(activities: T[], durationMin: number): T[] {
  if (activities.length === 0) return activities;
  const total = Math.max(1, Math.round(durationMin));
  const raw = activities.map((a) => (Number.isFinite(a.minutes) && a.minutes > 0 ? a.minutes : 1));
  const sum = raw.reduce((x, y) => x + y, 0);
  const scaled = raw.map((m) => Math.max(1, Math.round((m / sum) * total)));
  let diff = total - scaled.reduce((x, y) => x + y, 0);
  // Spread the rounding remainder over the longest activities.
  const order = scaled.map((_, i) => i).sort((a, b) => scaled[b] - scaled[a]);
  let guard = 0;
  while (diff !== 0 && guard++ < 1000) {
    for (const i of order) {
      if (diff === 0) break;
      if (diff > 0) {
        scaled[i] += 1;
        diff -= 1;
      } else if (scaled[i] > 1) {
        scaled[i] -= 1;
        diff += 1;
      }
    }
  }
  return activities.map((a, i) => ({ ...a, minutes: scaled[i] }));
}

/** Clamps exit-ticket answer indexes and fits timing. Safe to call on any validated lesson. */
export function normalizeLesson(lesson: Lesson, durationMin: number): Lesson {
  return {
    ...lesson,
    activities: fitActivityMinutes(lesson.activities, durationMin),
    exitTicket: lesson.exitTicket.map((q) => ({
      ...q,
      answerIndex: Math.min(Math.max(0, q.answerIndex), q.options.length - 1),
    })),
  };
}
