import { jaccard, normalize } from "./fuzzy";
import { stableId, type Concept, type KnowledgeUnit, type Library, type Relation } from "./types";

export interface MergeLogEntry {
  at: string;
  docId: string;
  conceptsMerged: string[];
  conceptsLinked: Array<{ from: string; to: string }>;
  conceptsNew: string[];
  unitsAdded: number;
  unitsAlreadyKnown: number;
}

const MERGE_AT = 0.85;
const LINK_AT = 0.6;

function conceptSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  return jaccard(a, b);
}

/**
 * Folds a new set of notes into the library (the "hive mind", spec S4). Same facts are stored once and remember every
 * note that says them; facts only one note has are added, so two notes on one topic complete each other. Pure: returns a
 * new library plus a log (the log makes the merge undoable).
 */
export function mergeIntoLibrary(lib: Library, incoming: { docId: string; concepts: Concept[]; units: KnowledgeUnit[]; relations?: Relation[] }): { library: Library; log: MergeLogEntry } {
  const library: Library = structuredClone(lib);
  const log: MergeLogEntry = { at: new Date().toISOString(), docId: incoming.docId, conceptsMerged: [], conceptsLinked: [], conceptsNew: [], unitsAdded: 0, unitsAlreadyKnown: 0 };
  const remap = new Map<string, string>();

  for (const c of incoming.concepts) {
    const exact = library.concepts[c.id];
    const best = exact
      ? { c: exact, s: 1 }
      : Object.values(library.concepts)
          .filter((x) => x.kind === c.kind)
          .map((x) => ({ c: x, s: conceptSimilarity(x.name, c.name) }))
          .sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= MERGE_AT) {
      remap.set(c.id, best.c.id);
      if (!best.c.docIds.includes(incoming.docId)) best.c.docIds.push(incoming.docId);
      if (!best.c.summary && c.summary) best.c.summary = c.summary;
      log.conceptsMerged.push(c.name);
    } else {
      library.concepts[c.id] = { ...c, kuIds: [], docIds: [incoming.docId] };
      remap.set(c.id, c.id);
      log.conceptsNew.push(c.name);
      if (best && best.s >= LINK_AT) {
        library.relations.push({ from: c.id, to: best.c.id, type: "related_to" });
        log.conceptsLinked.push({ from: c.name, to: best.c.name });
      }
    }
  }

  for (const u of incoming.units) {
    const conceptId = remap.get(u.conceptId) ?? u.conceptId;
    const known = library.units[u.id] ?? Object.values(library.units).find((x) => x.type === u.type && x.status === "active" && jaccard(x.statement, u.statement) >= MERGE_AT);
    if (known) {
      if (!known.alsoIn.some((a) => a.docId === u.source.docId && a.lineStart === u.source.lineStart) && known.source.docId !== u.source.docId) known.alsoIn.push(u.source);
      // agreeing notes make a fact more trustworthy
      known.confidence = Math.min(1, Math.max(known.confidence, u.confidence) + 0.03);
      log.unitsAlreadyKnown++;
      continue;
    }
    library.units[u.id] = { ...u, conceptId };
    const concept = library.concepts[conceptId];
    if (concept && !concept.kuIds.includes(u.id)) concept.kuIds.push(u.id);
    log.unitsAdded++;
  }

  for (const r of incoming.relations ?? []) {
    const from = remap.get(r.from) ?? r.from;
    const to = remap.get(r.to) ?? r.to;
    if (!library.relations.some((x) => x.from === from && x.to === to && x.type === r.type)) library.relations.push({ ...r, from, to });
  }
  if (!library.docIds.includes(incoming.docId)) library.docIds.push(incoming.docId);
  return { library, log };
}

export { stableId };
