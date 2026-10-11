/**
 * Bayesian Knowledge Tracing (BKT) Diagnostic Propagation Engine.
 *
 * Implements bounded Bayesian prior propagation across prerequisite DAG graphs
 * during placement diagnostics and adaptive assessments.
 */

export interface KcGraphNode {
  id: string;
  title?: string;
  prerequisiteIds?: string[];
}

export interface PropagateParams {
  currentPLMap: Record<string, number>;
  answeredKcId: string;
  isCorrect: boolean;
  kcs: KcGraphNode[];
}

/**
 * Returns all transitive ancestor (prerequisite) KC IDs for a target node.
 */
export function getTransitivePrerequisites(targetId: string, kcs: KcGraphNode[]): string[] {
  const kcMap = new Map<string, KcGraphNode>(kcs.map((k) => [k.id, k]));
  const visited = new Set<string>();
  const queue: string[] = [...(kcMap.get(targetId)?.prerequisiteIds || [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!visited.has(current)) {
      visited.add(current);
      const node = kcMap.get(current);
      if (node?.prerequisiteIds) {
        for (const pid of node.prerequisiteIds) {
          if (!visited.has(pid)) {
            queue.push(pid);
          }
        }
      }
    }
  }

  return Array.from(visited);
}

/**
 * Returns all transitive descendant (dependent) KC IDs for a target node.
 */
export function getTransitiveDependents(targetId: string, kcs: KcGraphNode[]): string[] {
  // Build reverse adjacency list: parent -> children
  const childrenMap = new Map<string, string[]>();
  for (const node of kcs) {
    if (node.prerequisiteIds) {
      for (const pid of node.prerequisiteIds) {
        const list = childrenMap.get(pid) || [];
        list.push(node.id);
        childrenMap.set(pid, list);
      }
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [...(childrenMap.get(targetId) || [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!visited.has(current)) {
      visited.add(current);
      const kids = childrenMap.get(current) || [];
      for (const kid of kids) {
        if (!visited.has(kid)) {
          queue.push(kid);
        }
      }
    }
  }

  return Array.from(visited);
}

/**
 * Propagates diagnostic evidence across the prerequisite DAG:
 * - If a learner answers correctly on an advanced/dependant KC, we infer higher
 *   likelihood of prerequisite competence and raise prerequisite priors (max +0.15, bounded by 0.95).
 * - If a learner fails a foundational KC, we infer that downstream dependent concepts
 *   are likely deficient and lower dependent priors (max -0.15, bounded by 0.05).
 */
export function propagateDiagnosticAnswer({
  currentPLMap,
  answeredKcId,
  isCorrect,
  kcs,
}: PropagateParams): Record<string, number> {
  const updatedMap: Record<string, number> = { ...currentPLMap };

  if (isCorrect) {
    // Correct on answered KC -> propagate positive prior update to prerequisites
    const ancestors = getTransitivePrerequisites(answeredKcId, kcs);
    for (const ancId of ancestors) {
      const cur = updatedMap[ancId] ?? 0.20;
      if (cur < 0.95) {
        const boost = Math.min(0.15, (0.95 - cur) * 0.35);
        updatedMap[ancId] = Number(Math.min(0.95, cur + boost).toFixed(4));
      }
    }
  } else {
    // Incorrect on answered KC -> propagate negative prior update to dependents
    const dependents = getTransitiveDependents(answeredKcId, kcs);
    for (const depId of dependents) {
      const cur = updatedMap[depId] ?? 0.20;
      if (cur > 0.05) {
        const penalty = Math.min(0.15, (cur - 0.05) * 0.35);
        updatedMap[depId] = Number(Math.max(0.05, cur - penalty).toFixed(4));
      }
    }
  }

  return updatedMap;
}

/**
 * Selects the next most informative Knowledge Component for placement diagnostic.
 * Prioritizes unlocked KCs with highest epistemic uncertainty (pL closest to 0.50).
 */
export function selectNextAdaptiveKc({
  kcs,
  answeredKcIds,
  currentPLMap,
}: {
  kcs: KcGraphNode[];
  answeredKcIds: Set<string> | string[];
  currentPLMap: Record<string, number>;
}): string | null {
  const answeredSet = answeredKcIds instanceof Set ? answeredKcIds : new Set(answeredKcIds);
  const remaining = kcs.filter((k) => !answeredSet.has(k.id));

  if (remaining.length === 0) return null;

  // Check which remaining KCs have prerequisites satisfied or are foundational
  const unlockedCandidates = remaining.filter((node) => {
    if (!node.prerequisiteIds || node.prerequisiteIds.length === 0) return true;
    // Unlocked if all prerequisites have pL >= 0.60 in diagnostic
    return node.prerequisiteIds.every((pid) => (currentPLMap[pid] ?? 0.20) >= 0.60);
  });

  const candidates = unlockedCandidates.length > 0 ? unlockedCandidates : remaining;

  // Pick KC with pL closest to 0.50 (maximum entropy / information gain)
  let bestKcId = candidates[0].id;
  let minDiff = 1.0;

  for (const c of candidates) {
    const pl = currentPLMap[c.id] ?? 0.20;
    const diff = Math.abs(pl - 0.50);
    if (diff < minDiff) {
      minDiff = diff;
      bestKcId = c.id;
    }
  }

  return bestKcId;
}

export interface DiagnosticSummary {
  strongKcs: Array<{ id: string; title: string; pL: number }>;
  weakKcs: Array<{ id: string; title: string; pL: number }>;
  inProgressKcs: Array<{ id: string; title: string; pL: number }>;
  suggestedFirstKc: { id: string; title: string; pL: number } | null;
  averageStartingPL: number;
}

/**
 * Computes diagnostic placement summary and optimal starting point.
 */
export function computeDiagnosticSummary({
  kcs,
  finalPLMap,
}: {
  kcs: KcGraphNode[];
  finalPLMap: Record<string, number>;
}): DiagnosticSummary {
  const strongKcs: Array<{ id: string; title: string; pL: number }> = [];
  const weakKcs: Array<{ id: string; title: string; pL: number }> = [];
  const inProgressKcs: Array<{ id: string; title: string; pL: number }> = [];
  let totalPL = 0;

  for (const node of kcs) {
    const pL = finalPLMap[node.id] ?? 0.20;
    totalPL += pL;
    const item = { id: node.id, title: node.title || node.id, pL };
    if (pL >= 0.70) strongKcs.push(item);
    else if (pL < 0.40) weakKcs.push(item);
    else inProgressKcs.push(item);
  }

  const averageStartingPL = kcs.length > 0 ? Number((totalPL / kcs.length).toFixed(3)) : 0.20;

  // Identify first recommended KC to study:
  // First unmastered KC (< 0.85) whose prerequisites are met (pL >= 0.65)
  let suggestedFirstKc: { id: string; title: string; pL: number } | null = null;
  for (const node of kcs) {
    const pL = finalPLMap[node.id] ?? 0.20;
    if (pL < 0.85) {
      const prereqsMet =
        !node.prerequisiteIds ||
        node.prerequisiteIds.length === 0 ||
        node.prerequisiteIds.every((pid) => (finalPLMap[pid] ?? 0.20) >= 0.65);

      if (prereqsMet) {
        suggestedFirstKc = { id: node.id, title: node.title || node.id, pL };
        break;
      }
    }
  }

  if (!suggestedFirstKc && weakKcs.length > 0) {
    suggestedFirstKc = weakKcs[0];
  } else if (!suggestedFirstKc && inProgressKcs.length > 0) {
    suggestedFirstKc = inProgressKcs[0];
  }

  return {
    strongKcs,
    weakKcs,
    inProgressKcs,
    suggestedFirstKc,
    averageStartingPL,
  };
}
