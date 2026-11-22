import type { FeatureEntry, FeatureGroup } from "./registry";

/** What a person is trying to do. The hubs group features by this, not by which team built them. */
export type Intent = "Capture" | "Understand" | "Practise" | "Review" | "Plan" | "Build" | "Progress" | "Together" | "Rewards" | "Teach";

export const INTENT_ORDER: Intent[] = ["Capture", "Understand", "Practise", "Review", "Plan", "Build", "Progress", "Together", "Rewards", "Teach"];

export const INTENT_HINT: Record<Intent, string> = {
  Capture: "Get your material in",
  Understand: "Make sense of it",
  Practise: "Check you know it",
  Review: "Bring it back before you forget",
  Plan: "Organise your time",
  Build: "Make and test things",
  Progress: "See how you are doing",
  Together: "Study with others",
  Rewards: "Stay motivated",
  Teach: "For teachers",
};

const BY_ID: Record<string, Intent> = {
  notes: "Capture",
  snap: "Capture",
  "for-you": "Understand",
  eli: "Understand",
  voice: "Understand",
  mindmap: "Understand",
  papers: "Practise",
  flashcards: "Review",
  daily: "Review",
  mistakes: "Review",
  exams: "Plan",
  focus: "Plan",
  goals: "Plan",
  evaluation: "Progress",
  "learning-map": "Progress",
  heatmap: "Progress",
};

const BY_GROUP: Record<FeatureGroup, Intent> = {
  Study: "Understand",
  Social: "Together",
  Maker: "Build",
  Rewards: "Rewards",
  Teachers: "Teach",
  Everywhere: "Understand",
};

export function intentOf(f: Pick<FeatureEntry, "id" | "group">): Intent {
  return BY_ID[f.id] ?? BY_GROUP[f.group];
}

/** Items grouped by intent, in a fixed, sensible order; empty groups are left out. */
export function groupByIntent<T extends { intent: Intent }>(items: T[]): Array<{ intent: Intent; items: T[] }> {
  return INTENT_ORDER.map((intent) => ({ intent, items: items.filter((i) => i.intent === intent) })).filter((g) => g.items.length > 0);
}
