import type { Activity } from "./activities";
import { jaccard, normalize, wordCount } from "./fuzzy";
import { stableId, type KnowledgeUnit, type Library } from "./types";

/** The lecture loop as data (spec 11): short teach beats, each followed by a check, then a recap. */
export interface Beat {
  id: string;
  kind: "teach" | "check" | "recap";
  text: string;
  kuIds: string[];
  checkActivityId?: string;
}
export interface WorldNode {
  id: string;
  title: string;
  zoneId: string;
  conceptId: string;
  kuIds: string[];
  beats: Beat[];
  activityIds: string[];
  estMinutes: number;
}
export interface Zone {
  id: string;
  title: string;
  nodeIds: string[];
  boss: { pool: string[] };
  unlock: { requiresZoneId?: string; minMastery: number };
}
export interface WorldDesign {
  zones: Zone[];
  nodes: WorldNode[];
}

const MAX_ZONES = 8;
const NODE_MAX = 12;
const NODE_MIN = 6;

const shortTitle = (s: string) => s.replace(/^#+\s*/, "").replace(/[:：]\s*$/, "").split(/\s+/).slice(0, 5).join(" ");
const orderOf = (a: KnowledgeUnit, b: KnowledgeUnit) => (a.order ?? 1e6) - (b.order ?? 1e6) || a.source.docId.localeCompare(b.source.docId) || a.source.lineStart - b.source.lineStart;

function chunk<T>(xs: T[], size: number, min: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  // a short tail joins the previous node instead of becoming a node of one or two facts
  if (out.length > 1 && out[out.length - 1].length < Math.ceil(min / 2)) {
    const tail = out.pop()!;
    out[out.length - 1].push(...tail);
  }
  return out;
}

/** Beats built from the notes' own statements: 2 to 3 facts per beat, at most 90 words, one check after each (R14: no invented text). */
export function buildBeats(kus: KnowledgeUnit[], activities: Activity[], nodeId: string): Beat[] {
  const beats: Beat[] = [];
  let i = 0;
  let n = 0;
  const checkFor = (ku: KnowledgeUnit) => activities.find((a) => a.kuIds.length === 1 && a.kuIds[0] === ku.id && a.template === "mcq") ?? activities.find((a) => a.kuIds.length === 1 && a.kuIds[0] === ku.id);
  while (i < kus.length) {
    const group: KnowledgeUnit[] = [];
    while (i < kus.length && group.length < 3 && wordCount(group.concat(kus[i]).map((k) => k.statement).join(" ")) <= 90) group.push(kus[i++]);
    if (group.length === 0) group.push(kus[i++]);
    const id = `${nodeId}_b${++n}`;
    beats.push({ id, kind: "teach", text: group.map((k) => k.statement).join(" "), kuIds: group.map((k) => k.id) });
    const check = checkFor(group[group.length - 1]);
    if (check) beats.push({ id: `${id}_check`, kind: "check", text: "", kuIds: [group[group.length - 1].id], checkActivityId: check.id });
  }
  const critical = kus.filter((k) => k.critical);
  const recap = (critical.length >= 3 ? critical : kus).slice(0, 3);
  if (recap.length) beats.push({ id: `${nodeId}_recap`, kind: "recap", text: recap.map((k) => `• ${k.statement}`).join("\n"), kuIds: recap.map((k) => k.id) });
  return beats;
}

/**
 * Spec S6: zones are the topics in the notes, nodes are 5 to 7 minute lessons of about 6 to 14 facts, prerequisites and
 * document order first, and the first node is a quick win. Deterministic: the same library always gives the same world.
 */
export function designWorld(lib: Library, activities: Activity[]): WorldDesign {
  const concepts = Object.values(lib.concepts).filter((c) => c.kuIds.some((id) => lib.units[id]?.status === "active"));

  // group concepts into topics; similar topic names (two notes on one subject) share a zone
  const topics: Array<{ title: string; concepts: typeof concepts }> = [];
  for (const c of concepts) {
    const t = c.topic || "Notes";
    const hit = topics.find((x) => normalize(x.title) === normalize(t) || jaccard(x.title, t) >= 0.6);
    if (hit) hit.concepts.push(c);
    else topics.push({ title: t, concepts: [c] });
  }
  topics.sort((a, b) => b.concepts.length - a.concepts.length);
  while (topics.length > MAX_ZONES) {
    const last = topics.pop()!;
    const more = topics.find((t) => t.title === "More notes");
    if (more) more.concepts.push(...last.concepts);
    else topics.push({ title: "More notes", concepts: last.concepts });
    topics.sort((a, b) => (a.title === "More notes" ? 1 : b.title === "More notes" ? -1 : b.concepts.length - a.concepts.length));
  }
  // document order for the zones themselves
  const firstDoc = (t: (typeof topics)[number]) => Math.min(...t.concepts.flatMap((c) => c.kuIds.map((id) => lib.units[id]?.source.lineStart ?? 1e9)));
  topics.sort((a, b) => (a.title === "More notes" ? 1 : b.title === "More notes" ? -1 : firstDoc(a) - firstDoc(b)));

  const zones: Zone[] = [];
  const nodes: WorldNode[] = [];
  topics.forEach((t, zi) => {
    const zoneId = stableId("zone", normalize(t.title));
    const zoneNodes: WorldNode[] = [];
    const small: KnowledgeUnit[] = [];
    for (const c of t.concepts) {
      const kus = c.kuIds.map((id) => lib.units[id]).filter((u): u is KnowledgeUnit => !!u && u.status === "active").sort(orderOf);
      if (kus.length < 4 && t.concepts.length > 1) {
        small.push(...kus);
        continue;
      }
      chunk(kus, NODE_MAX, NODE_MIN).forEach((part, i, all) => {
        const id = stableId("node", `${c.id}|${i}`);
        zoneNodes.push({ id, title: shortTitle(c.name) + (all.length > 1 ? ` ${i + 1}` : ""), zoneId, conceptId: c.id, kuIds: part.map((k) => k.id), beats: [], activityIds: [], estMinutes: 5 });
      });
    }
    if (small.length) {
      chunk(small, NODE_MAX, NODE_MIN).forEach((part, i, all) => {
        zoneNodes.push({ id: stableId("node", `${zoneId}|quick|${i}`), title: all.length > 1 ? `Quick facts ${i + 1}` : "Quick facts", zoneId, conceptId: part[0].conceptId, kuIds: part.map((k) => k.id), beats: [], activityIds: [], estMinutes: 5 });
      });
    }
    // the very first node of the world is a quick win: a small one, if there is one
    if (zi === 0 && zoneNodes.length > 1) {
      const win = zoneNodes.findIndex((n) => n.kuIds.length >= 3 && n.kuIds.length <= 6);
      if (win > 0) zoneNodes.unshift(...zoneNodes.splice(win, 1));
    }
    zones.push({ id: zoneId, title: shortTitle(t.title), nodeIds: zoneNodes.map((n) => n.id), boss: { pool: [] }, unlock: { requiresZoneId: zi > 0 ? zones[zi - 1]?.id : undefined, minMastery: 0.6 } });
    nodes.push(...zoneNodes);
  });

  // activities belong to the node holding their first fact; beats and time estimates follow
  const nodeOfKu = new Map<string, WorldNode>();
  for (const n of nodes) for (const k of n.kuIds) nodeOfKu.set(k, n);
  for (const a of activities) nodeOfKu.get(a.kuIds[0])?.activityIds.push(a.id);
  for (const n of nodes) {
    const kus = n.kuIds.map((id) => lib.units[id]).filter(Boolean);
    const own = activities.filter((a) => n.activityIds.includes(a.id));
    n.beats = buildBeats(kus, own, n.id);
    n.estMinutes = Math.max(3, Math.min(7, Math.round(n.beats.length * 0.45 + own.length * 0.15)));
  }
  // a boss per zone: mixed, from every node, plus a fifth from earlier zones
  zones.forEach((z, zi) => {
    const own = nodes.filter((n) => n.zoneId === z.id).flatMap((n) => n.activityIds.filter((id) => activities.find((a) => a.id === id)?.template !== "flip_recall"));
    const earlier = zones.slice(0, zi).flatMap((p) => p.boss.pool).slice(0, Math.max(0, Math.round(own.length * 0.2)));
    z.boss.pool = [...own.slice(0, 15), ...earlier];
  });
  return { zones, nodes };
}
