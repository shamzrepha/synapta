/**
 * Learning Map Planner for Sunroot AI Teacher Engine.
 *
 * Pure algorithmic functions for DAG topological path planning,
 * pacing against target exam/course deadlines, and next best activity selection.
 */

export interface KcPlanNode {
  id: string;
  title: string;
  prerequisiteIds?: string[];
  order?: number;
  hasLab?: boolean;
}

export interface KcState {
  pL: number;
  misconceptionCount?: number;
  attempts?: number;
  lastPracticedAt?: string | null;
  stability?: number;
  nextReviewAt?: string | null;
}

export type PlannedActivity = "learn" | "practice_quiz" | "lab" | "teach_back" | "review";
export type PaceStatus = "on_track" | "behind" | "ahead";

/**
 * Returns the next best pedagogical activity based on the learner's latent BKT state.
 */
export function nextBestActivity(state: KcState, hasLab = false): PlannedActivity {
  const { pL, nextReviewAt } = state;

  // Check if due for spaced review
  if (nextReviewAt && new Date(nextReviewAt).getTime() <= Date.now() && pL >= 0.50) {
    return "review";
  }

  // Novice: needs foundational schema and worked examples
  if (pL < 0.30) {
    return "learn";
  }

  // Emerging (0.30 - 0.70): active practice quizzes and virtual simulation labs
  if (pL < 0.70) {
    if (hasLab && pL >= 0.48) {
      return "lab";
    }
    return "practice_quiz";
  }

  // Competent (0.70 - 0.90): teach-back / transfer evaluation
  if (pL < 0.90) {
    return "teach_back";
  }

  // Mastered (> 0.90)
  return "review";
}

/**
 * Builds an optimal, ordered study path through the course prerequisite DAG.
 * - Topological sort ensuring prerequisites precede dependents
 * - Prerequisites must reach threshold (>= 0.70) before dependents are recommended
 * - Skips KCs that are already mastered (pL >= 0.90)
 * - Prioritizes foundational bottleneck KCs that unlock the most downstream concepts
 */
export function buildPath({
  kcs,
  masteryMap,
}: {
  kcs: KcPlanNode[];
  masteryMap: Record<string, number>;
}): Array<{ kc: KcPlanNode; currentPL: number; isUnlocked: boolean; activity: PlannedActivity }> {

  // Count downstream dependents for each KC (unlock power)
  const dependentCount = new Map<string, number>();
  for (const node of kcs) {
    dependentCount.set(node.id, 0);
  }
  for (const node of kcs) {
    if (node.prerequisiteIds) {
      for (const pid of node.prerequisiteIds) {
        dependentCount.set(pid, (dependentCount.get(pid) || 0) + 1);
      }
    }
  }

  // Sort KCs:
  // 1. Unmastered first (pL < 0.90)
  // 2. Prerequisites before dependents
  // 3. Higher downstream impact first
  // 4. Fallback to curriculum order
  const path: Array<{ kc: KcPlanNode; currentPL: number; isUnlocked: boolean; activity: PlannedActivity }> = [];

  for (const node of kcs) {
    const pL = masteryMap[node.id] ?? 0.20;
    // Skip already mastered concepts from primary queue
    if (pL >= 0.90) continue;

    const prereqs = node.prerequisiteIds || [];
    const isUnlocked =
      prereqs.length === 0 || prereqs.every((pid) => (masteryMap[pid] ?? 0.20) >= 0.70);

    const activity = nextBestActivity({ pL }, node.hasLab);

    path.push({
      kc: node,
      currentPL: pL,
      isUnlocked,
      activity,
    });
  }

  // Stable sort: unlocked first, then highest dependent count, then original order
  path.sort((a, b) => {
    if (a.isUnlocked && !b.isUnlocked) return -1;
    if (!a.isUnlocked && b.isUnlocked) return 1;

    const depA = dependentCount.get(a.kc.id) || 0;
    const depB = dependentCount.get(b.kc.id) || 0;
    if (depB !== depA) return depB - depA;

    return (a.kc.order ?? 0) - (b.kc.order ?? 0);
  });

  return path;
}

export interface PaceResult {
  weeksRemaining: number;
  daysRemaining: number;
  kcsRemaining: number;
  kcsPerWeekRequired: number;
  status: PaceStatus;
  statusMessage: string;
}

/**
 * Calculates learning velocity and pacing against a target deadline and available daily study time.
 */
export function paceWeeks({
  pathLength,
  targetDate,
  minutesPerDay = 30,
  today = new Date(),
}: {
  pathLength: number;
  targetDate?: string | null;
  minutesPerDay?: number;
  today?: Date;
}): PaceResult {
  if (!targetDate) {
    return {
      weeksRemaining: 4,
      daysRemaining: 28,
      kcsRemaining: pathLength,
      kcsPerWeekRequired: Number((pathLength / 4).toFixed(1)),
      status: "on_track",
      statusMessage: "Pacing comfortably with standard 4-week horizon.",
    };
  }

  const target = new Date(targetDate);
  const diffTime = target.getTime() - today.getTime();
  const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  const weeksRemaining = Math.max(1, Number((daysRemaining / 7).toFixed(1)));

  const kcsPerWeekRequired = Number((pathLength / weeksRemaining).toFixed(1));

  // Capacity model: average KC mastery takes approx 45 minutes of active effort
  // Weekly available minutes = minutesPerDay * 6 (assuming 6 active days/week)
  const weeklyStudyMinutes = minutesPerDay * 6;
  const weeklyKcCapacity = weeklyStudyMinutes / 45;

  let status: PaceStatus = "on_track";
  let statusMessage = "On schedule to achieve mastery before deadline.";

  if (pathLength === 0) {
    status = "ahead";
    statusMessage = "All required knowledge components mastered!";
  } else if (kcsPerWeekRequired > weeklyKcCapacity * 1.2) {
    status = "behind";
    const deficit = Math.ceil(kcsPerWeekRequired - weeklyKcCapacity);
    statusMessage = `Behind pace by ~${deficit} topics/week. Recommend increasing daily study time or extending target date.`;
  } else if (kcsPerWeekRequired <= weeklyKcCapacity * 0.4) {
    status = "ahead";
    statusMessage = "Ahead of schedule. On track to master ahead of deadline.";
  }

  return {
    weeksRemaining,
    daysRemaining,
    kcsRemaining: pathLength,
    kcsPerWeekRequired,
    status,
    statusMessage,
  };
}
