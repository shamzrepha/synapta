/**
 * Tidies a class's topic structure WITHOUT any AI and without reading or rewriting a single lesson:
 * fixes broken or circular prerequisites and parents, puts topics in a sensible order (prerequisites first, otherwise the
 * order the lecturer already has), and keeps the weeks consistent with that order. Titles, descriptions, lesson text,
 * practice, publish state and every student record are never touched. Pure, so it is testable and costs no tokens.
 */

export interface KcNode {
  id: string;
  order?: number;
  week?: number;
  prerequisiteIds?: string[];
  parentId?: string | null;
}

export interface KcChange {
  id: string;
  order?: number;
  week?: number;
  prerequisiteIds?: string[];
  parentId?: string | null;
}

export interface RestructureResult {
  changes: KcChange[];
  summary: { topics: number; changed: number; reordered: number; prerequisitesRemoved: number; weeksFixed: number; parentsFixed: number };
}

const validWeek = (w: unknown, max: number): w is number => typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= max;

export function restructureKcs(kcs: KcNode[], opts: { durationWeeks?: number } = {}): RestructureResult {
  const n = kcs.length;
  const weeksMax = Math.max(1, Math.min(52, Math.floor(opts.durationWeeks || 0) || Math.max(1, Math.ceil(n / 3))));
  const ids = new Set(kcs.map((k) => k.id));
  const startOrder = new Map(kcs.map((k, i) => [k.id, typeof k.order === "number" ? k.order : i + 1]));
  const byStart = [...kcs].sort((a, b) => (startOrder.get(a.id)! - startOrder.get(b.id)!) || a.id.localeCompare(b.id));

  // 1. prerequisites that point at nothing, at the topic itself, or twice
  let prereqRemoved = 0;
  const prereq = new Map<string, string[]>();
  for (const k of byStart) {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const p of k.prerequisiteIds || []) {
      if (p === k.id || !ids.has(p) || seen.has(p)) {
        prereqRemoved++;
        continue;
      }
      seen.add(p);
      kept.push(p);
    }
    prereq.set(k.id, kept);
  }

  // 2. circular prerequisites: walk in the lecturer's order and drop the link that closes a loop
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (prereq.get(from) || []).some((p) => reaches(p, target, seen));
  };
  for (const k of byStart) {
    const kept: string[] = [];
    for (const p of prereq.get(k.id) || []) {
      // p is a prerequisite of k; it would close a loop if k is already (indirectly) a prerequisite of p
      if (reaches(p, k.id)) prereqRemoved++;
      else kept.push(p);
    }
    prereq.set(k.id, kept);
  }

  // 3. order: prerequisites first, ties keep the lecturer's order (Kahn's algorithm, stable)
  const indeg = new Map<string, number>(byStart.map((k) => [k.id, (prereq.get(k.id) || []).length]));
  const rank = new Map(byStart.map((k, i) => [k.id, i]));
  const ready = byStart.filter((k) => indeg.get(k.id) === 0).map((k) => k.id);
  const sorted: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => rank.get(a)! - rank.get(b)!);
    const id = ready.shift()!;
    sorted.push(id);
    for (const k of byStart) {
      if ((prereq.get(k.id) || []).includes(id)) {
        indeg.set(k.id, indeg.get(k.id)! - 1);
        if (indeg.get(k.id) === 0) ready.push(k.id);
      }
    }
  }
  const newOrder = new Map(sorted.map((id, i) => [id, i + 1]));

  // 4. weeks: keep a valid week; fix a missing one, and never put a topic in an earlier week than its prerequisites
  const week = new Map<string, number>();
  let weeksFixed = 0;
  let prev = 1;
  for (const id of sorted) {
    const k = kcs.find((x) => x.id === id)!;
    const pos = newOrder.get(id)!;
    let w = validWeek(k.week, weeksMax) ? k.week : Math.max(1, Math.min(weeksMax, Math.ceil((pos / Math.max(1, n)) * weeksMax)));
    const floor = Math.max(1, ...((prereq.get(id) || []).map((p) => week.get(p) || 1)), prev);
    if (w < floor) w = floor;
    w = Math.min(weeksMax, w);
    week.set(id, w);
    prev = w;
    if (w !== k.week) weeksFixed++;
  }

  // 5. parents: must exist, must not be the topic itself, and must not loop
  const parentOf = new Map<string, string | null>();
  let parentsFixed = 0;
  for (const k of kcs) {
    let p = k.parentId && ids.has(k.parentId) && k.parentId !== k.id ? k.parentId : null;
    if (p) {
      let cur: string | null = p;
      const seen = new Set<string>([k.id]);
      while (cur) {
        if (seen.has(cur)) {
          p = null;
          break;
        }
        seen.add(cur);
        cur = kcs.find((x) => x.id === cur)?.parentId || null;
      }
    }
    if ((k.parentId || null) !== p) parentsFixed++;
    parentOf.set(k.id, p);
  }

  const changes: KcChange[] = [];
  let reordered = 0;
  for (const k of kcs) {
    const c: KcChange = { id: k.id };
    const o = newOrder.get(k.id) ?? (k.order ?? 0);
    if (o !== k.order) {
      c.order = o;
      reordered++;
    }
    const w = week.get(k.id) ?? k.week;
    if (w !== undefined && w !== k.week) c.week = w;
    const pr = prereq.get(k.id) || [];
    if (JSON.stringify(pr) !== JSON.stringify(k.prerequisiteIds || [])) c.prerequisiteIds = pr;
    const pa = parentOf.get(k.id) ?? null;
    if (pa !== (k.parentId || null)) c.parentId = pa;
    if (Object.keys(c).length > 1) changes.push(c);
  }
  return { changes, summary: { topics: n, changed: changes.length, reordered, prerequisitesRemoved: prereqRemoved, weeksFixed, parentsFixed } };
}
