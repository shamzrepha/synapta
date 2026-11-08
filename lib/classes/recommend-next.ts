/**
 * Where should this learner go next? Every topic in a class is open; this picks the one worth doing now and says why.
 * It never locks anything: it only recommends.
 */
export interface MapTopic {
  id: string;
  order: number;
  /** current mastery, 0 to 1 */
  pL: number;
  attempts: number;
  prerequisiteIds?: string[];
}

export type RecommendationKind = "start" | "strengthen" | "next" | "done";

export interface Recommendation {
  id: string | null;
  kind: RecommendationKind;
  /** one plain sentence a learner can act on */
  reason: string;
}

export const MASTERED = 0.95;
export const SOLID = 0.7;
export const WEAK = 0.4;

export const percent = (p: number) => `${Math.round(p * 100)}%`;
export const isStarted = (t: MapTopic) => t.attempts > 0;
export const isMastered = (t: MapTopic) => isStarted(t) && t.pL >= MASTERED;

export function recommendNext(topics: MapTopic[]): Recommendation {
  const sorted = [...topics].sort((a, b) => a.order - b.order);
  if (sorted.length === 0) return { id: null, kind: "done", reason: "This class has no topics yet." };

  const byId = new Map(sorted.map((t) => [t.id, t]));
  const prereqsSolid = (t: MapTopic) => (t.prerequisiteIds ?? []).every((id) => {
    const p = byId.get(id);
    return !p || p.pL >= SOLID;
  });

  // 1. nothing begun: start at the beginning
  if (!sorted.some(isStarted)) {
    const first = sorted.find((t) => (t.prerequisiteIds ?? []).length === 0) ?? sorted[0];
    return { id: first.id, kind: "start", reason: "Start here. It is the first topic and everything builds from it." };
  }

  // 2. something begun but shaky: shore it up before moving on
  const shaky = sorted.filter((t) => isStarted(t) && t.pL < WEAK).sort((a, b) => a.pL - b.pL)[0];
  if (shaky) {
    return { id: shaky.id, kind: "strengthen", reason: `You are at ${percent(shaky.pL)} here. A short session now will make the topics after it easier.` };
  }

  // 3. the next topic you have not mastered whose groundwork is solid
  const next = sorted.find((t) => !isMastered(t) && prereqsSolid(t)) ?? sorted.find((t) => !isMastered(t));
  if (next) {
    return {
      id: next.id,
      kind: "next",
      reason: isStarted(next) ? `You are at ${percent(next.pL)}. Keep going to reach mastery.` : "Next on your path. The topics before it are solid.",
    };
  }

  return { id: null, kind: "done", reason: "You have mastered every topic in this class." };
}

/** How far through the class: topics mastered out of all topics. */
export function classProgress(topics: MapTopic[]): { mastered: number; total: number } {
  return { mastered: topics.filter(isMastered).length, total: topics.length };
}
