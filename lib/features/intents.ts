import type { FeatureEntry, FeatureGroup } from "./registry";

/** What a person is trying to do. The hubs group features by this, not by which team built them. */
export type Intent = "Capture" | "Learn" | "Practice" | "Plan" | "Build" | "Together" | "Rewards" | "Teach";

export const INTENT_ORDER: Intent[] = ["Capture", "Learn", "Practice", "Plan", "Build", "Together", "Rewards", "Teach"];

export const INTENT_HINT: Record<Intent, string> = {
  Capture: "Get your material in",
  Learn: "Understand it",
  Practice: "Check you know it",
  Plan: "Organise your time",
  Build: "Make and test things",
  Together: "Study with others",
  Rewards: "Stay motivated",
  Teach: "For teachers",
};

const BY_ID: Record<string, Intent> = {
  notes: "Capture",
  snap: "Capture",
  evaluation: "Practice",
  flashcards: "Practice",
  daily: "Practice",
  papers: "Practice",
  mistakes: "Practice",
  exams: "Plan",
  focus: "Plan",
  eli: "Learn",
  voice: "Learn",
  mindmap: "Learn",
};

const BY_GROUP: Record<FeatureGroup, Intent> = {
  Study: "Learn",
  Social: "Together",
  Maker: "Build",
  Rewards: "Rewards",
  Teachers: "Teach",
  Everywhere: "Learn",
};

export function intentOf(f: Pick<FeatureEntry, "id" | "group">): Intent {
  return BY_ID[f.id] ?? BY_GROUP[f.group];
}

/** Items grouped by intent, in a fixed, sensible order; empty groups are left out. */
export function groupByIntent<T extends { intent: Intent }>(items: T[]): Array<{ intent: Intent; items: T[] }> {
  return INTENT_ORDER.map((intent) => ({ intent, items: items.filter((i) => i.intent === intent) })).filter((g) => g.items.length > 0);
}
