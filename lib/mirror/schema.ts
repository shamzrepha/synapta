import { z } from "zod";

/**
 * The Learner Mirror: a small, deterministic model of HOW someone studies (formats they finish, pace, time of day,
 * persistence, interests). It models study habits only. It never diagnoses personality or ability.
 */

export const FORMATS = ["flashcards", "quiz", "lesson", "lab", "written", "podcast"] as const;
export type Format = (typeof FORMATS)[number];
export const FormatSchema = z.enum(FORMATS);

export const FORMAT_LABEL: Record<Format, string> = {
  flashcards: "Flashcards",
  quiz: "Quizzes",
  lesson: "Reading lessons",
  lab: "Labs and simulations",
  written: "Written practice",
  podcast: "Listening",
};

/** Half-life of every counter: recent behaviour counts more, so the model follows the learner as they change. */
export const HALF_LIFE_DAYS = 21;
/** Below this many (decayed) observations a trait is shown as "still learning about you" and ranked as neutral. */
export const MIN_EVIDENCE = 5;
export const MAX_TOPICS = 40;
export const MAX_INTERESTS = 8;

// ---------------------------------------------------------------- signals (what the client may send)

export const SIGNAL_KINDS = ["start", "finish", "skip", "too_hard", "too_easy", "hint", "retry", "confidence"] as const;
export const SignalSchema = z.object({
  kind: z.enum(SIGNAL_KINDS),
  format: FormatSchema,
  /** topic key; becomes an interest only when the learner finished something on it */
  topicId: z.string().trim().min(1).max(80).optional(),
  topicTitle: z.string().trim().min(1).max(80).optional(),
  dwellMs: z.number().int().min(0).max(3_600_000).optional(),
  expectedMs: z.number().int().min(1000).max(3_600_000).optional(),
  hints: z.number().int().min(0).max(20).optional(),
  /** 1 (not sure at all) to 5 (very sure) */
  confidence: z.number().int().min(1).max(5).optional(),
  /** local hour of day 0-23 when it happened */
  hour: z.number().int().min(0).max(23).optional(),
  sessionMinutes: z.number().min(0).max(600).optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const MAX_SIGNALS_PER_BATCH = 25;
export const SignalBatchSchema = z.object({ signals: z.array(SignalSchema).min(1).max(MAX_SIGNALS_PER_BATCH) });

// ---------------------------------------------------------------- stored state (decayed counters)

export const FormatCountersSchema = z.object({
  starts: z.number().default(0),
  finishes: z.number().default(0),
  skips: z.number().default(0),
  tooHard: z.number().default(0),
  tooEasy: z.number().default(0),
  hints: z.number().default(0),
  retries: z.number().default(0),
  dwellRatioSum: z.number().default(0),
  dwellN: z.number().default(0),
});
export type FormatCounters = z.infer<typeof FormatCountersSchema>;

export const PrefsSchema = z.object({
  /** "more" / "less" per format, set by the learner; beats anything observed */
  formats: z.record(FormatSchema, z.enum(["more", "less"])).default({}),
  pace: z.enum(["quick", "steady", "deep"]).nullable().default(null),
  examples: z.enum(["short", "long"]).nullable().default(null),
  encouragement: z.enum(["low", "medium", "high"]).nullable().default(null),
  /** things the learner says they are into ("football", "cooking"), used for examples only */
  interests: z.array(z.string().trim().min(1).max(40)).max(MAX_INTERESTS).default([]),
  /** gentle daily target, in cards of the feed */
  dailyGoalItems: z.number().int().min(1).max(20).default(6),
});
export type MirrorPrefs = z.infer<typeof PrefsSchema>;
export const DEFAULT_PREFS: MirrorPrefs = PrefsSchema.parse({});

export const MirrorStateSchema = z.object({
  v: z.literal(1).default(1),
  /** master switch: off = nothing is collected and nothing is personalised */
  personalise: z.boolean().default(false),
  /** when the counters were last decayed (ms) */
  asOf: z.number().default(0),
  formats: z.record(FormatSchema, FormatCountersSchema).default({}),
  hours: z.array(z.number()).length(24).default(Array.from({ length: 24 }, () => 0)),
  sessionSum: z.number().default(0),
  sessionN: z.number().default(0),
  confSum: z.number().default(0),
  confN: z.number().default(0),
  topics: z.record(z.string(), z.object({ title: z.string(), w: z.number() })).default({}),
  prefs: PrefsSchema.default(DEFAULT_PREFS),
  /** cached plain-language summary, at most one AI call per learner per week */
  summary: z.object({ text: z.string().max(600), at: z.number() }).nullable().default(null),
  /** total signals ever seen (not decayed), drives exploration decay */
  totalSignals: z.number().default(0),
});
export type MirrorState = z.infer<typeof MirrorStateSchema>;

export function emptyMirrorState(personalise = false): MirrorState {
  return MirrorStateSchema.parse({ personalise });
}

// ---------------------------------------------------------------- the profile (what the learner sees)

export type TraitSource = "observed" | "you_set" | "not_enough_data";
const SourceSchema = z.enum(["observed", "you_set", "not_enough_data"]);

export const TraitSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  /** 0..1 */
  value: z.number().min(0).max(1),
  /** 0..1, how much evidence backs it */
  confidence: z.number().min(0).max(1),
  source: SourceSchema,
});
export type Trait = z.infer<typeof TraitSchema>;

export interface MapNode {
  id: string;
  label: string;
  detail?: string;
  confidence: number;
  source: TraitSource;
  children?: MapNode[];
}
export const MapNodeSchema: z.ZodType<MapNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    detail: z.string().optional(),
    confidence: z.number().min(0).max(1),
    source: SourceSchema,
    children: z.array(MapNodeSchema).optional(),
  }),
);

export const MirrorProfileSchema = z.object({
  personalised: z.boolean(),
  evidence: z.number(),
  formats: z.record(z.string(), z.object({ affinity: z.number().min(0).max(1), confidence: z.number().min(0).max(1), source: SourceSchema })),
  pace: z.object({ value: z.enum(["quick", "steady", "deep"]), confidence: z.number().min(0).max(1), source: SourceSchema }),
  persistence: TraitSchema,
  confidence: TraitSchema,
  helpSeeking: TraitSchema,
  bestHours: z.array(z.number().int().min(0).max(23)),
  sessionMinutes: z.number().nullable(),
  interests: z.array(z.object({ label: z.string(), weight: z.number(), source: z.enum(["observed", "you_set"]) })),
  examples: z.enum(["short", "long"]),
  encouragement: z.enum(["low", "medium", "high"]),
  tree: MapNodeSchema,
});
export type MirrorProfile = z.infer<typeof MirrorProfileSchema>;
