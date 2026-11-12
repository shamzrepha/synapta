import type { MapNode } from "@/lib/mindmap/tree";

export interface MapKc {
  id: string;
  title: string;
  order?: number;
  parentId?: string | null;
}

/**
 * Turns a class's topics into the mind map's tree (class title at the root, then topics and sub-topics as the teacher or the
 * AI nested them). Ids stay the topics' own ids so a tap can open the right chapter. Parent cycles and missing parents are
 * handled: such topics hang from the root.
 */
export function kcsToMapTree(classTitle: string, kcs: MapKc[]): MapNode {
  const ids = new Set(kcs.map((k) => k.id));
  const byOrder = (a: MapKc, b: MapKc) => (a.order ?? 0) - (b.order ?? 0);
  const kids = new Map<string, MapKc[]>();
  const roots: MapKc[] = [];
  for (const k of kcs) {
    if (k.parentId && ids.has(k.parentId) && k.parentId !== k.id) kids.set(k.parentId, [...(kids.get(k.parentId) || []), k]);
    else roots.push(k);
  }
  const seen = new Set<string>();
  const build = (k: MapKc): MapNode => {
    seen.add(k.id);
    const children = (kids.get(k.id) || []).sort(byOrder).filter((c) => !seen.has(c.id)).map(build);
    return { id: k.id, title: k.title || "Topic", children };
  };
  const top = roots.sort(byOrder).map(build);
  // anything caught in a parent cycle still shows, under the root
  const lost: MapNode[] = [];
  for (const k of kcs) if (!seen.has(k.id)) lost.push(build(k));
  return { id: "root", title: classTitle || "Class", children: [...top, ...lost] };
}

export interface NodeColours {
  fill: string;
  text: string;
  dash?: boolean;
}

/**
 * Mastery by lightness (and a dashed outline for "not started"), never by hue alone: pale is new, deepest blue is mastered.
 * Fixed colours so a downloaded picture matches the screen.
 */
export function masteryColours(pL: number | undefined | null, started: boolean): NodeColours {
  if (!started || pL == null) return { fill: "#e2e8f0", text: "#334155", dash: true };
  if (pL >= 0.8) return { fill: "#1e3a8a", text: "#ffffff" };
  if (pL >= 0.5) return { fill: "#3b6df6", text: "#ffffff" };
  return { fill: "#a9c1ff", text: "#0f172a" };
}
