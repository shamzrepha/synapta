import { fuzzyContains, jaccard, normalize, tokens, wordCount } from "./fuzzy";
import { stableId, type KnowledgeUnit, type Library, type SourceAnchor } from "./types";

export type Template = "flip_recall" | "cloze" | "mcq" | "ordering" | "matching";

interface Base {
  id: string;
  kuIds: string[];
  template: Template;
  difficulty: 1 | 2 | 3;
  /** shown after answering: why */
  explain: string;
  anchors: SourceAnchor[];
  provenance: "notes";
  critical?: boolean;
}
export interface FlipRecall extends Base { template: "flip_recall"; prompt: string; answer: string }
export interface Cloze extends Base { template: "cloze"; text: string; blanks: Array<{ answer: string; accept: string[] }> }
export interface Mcq extends Base { template: "mcq"; stem: string; options: string[]; correctIndex: number }
export interface Ordering extends Base { template: "ordering"; items: string[] }
export interface Matching extends Base { template: "matching"; pairs: Array<{ left: string; right: string }> }
export type Activity = FlipRecall | Cloze | Mcq | Ordering | Matching;

const STOP = new Set(["the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "for", "with", "at", "on", "be", "it", "this", "that", "by", "as", "from", "not", "do", "does", "can", "may", "will", "should", "must"]);
const aid = (template: Template, kuIds: string[]) => stableId("act", `${template}|${kuIds.join(",")}`);

const active = (lib: Library) => Object.values(lib.units).filter((u) => u.status === "active");

/** Spec 9.2: distractors from the same concept or look-alikes (they teach contrast), never the same fact as the answer. */
export function pickDistractors(ku: KnowledgeUnit, pool: KnowledgeUnit[], want = 3): string[] {
  const correct = normalize(ku.answer);
  const seen = new Set([correct]);
  const ranked = pool
    .filter((u) => u.id !== ku.id)
    .map((u) => ({ u, score: (u.conceptId === ku.conceptId ? 2 : 0) + (u.type === ku.type ? 1 : 0), len: Math.abs(wordCount(u.answer) - wordCount(ku.answer)) }))
    .sort((a, b) => b.score - a.score || a.len - b.len);
  const out: string[] = [];
  for (const { u } of ranked) {
    const n = normalize(u.answer);
    if (!n || seen.has(n)) continue;
    if (jaccard(u.answer, ku.answer) >= 0.5) continue; // too close to the right answer: could be the same fact
    if (n.includes(correct) || correct.includes(n)) continue;
    const a = wordCount(ku.answer);
    const b = wordCount(u.answer);
    if (Math.max(a, b) > 3 && Math.min(a, b) / Math.max(a, b) < 0.6) continue; // keep option lengths similar
    seen.add(n);
    out.push(u.answer.trim());
    if (out.length >= want) break;
  }
  return out;
}

/** Position of the right option is chosen by the app (a seeded shuffle), never by a model. */
function seededShuffle<T>(xs: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function base(template: Template, kus: KnowledgeUnit[], difficulty: 1 | 2 | 3): Base {
  return { id: aid(template, kus.map((k) => k.id)), kuIds: kus.map((k) => k.id), template, difficulty, explain: kus.map((k) => k.statement).join(" ").slice(0, 400), anchors: kus.map((k) => k.source), provenance: "notes", ...(kus.some((k) => k.critical) ? { critical: true } : {}) };
}

export function buildFlip(ku: KnowledgeUnit): FlipRecall {
  return { ...base("flip_recall", [ku], 1), template: "flip_recall", prompt: ku.question, answer: ku.answer };
}

export function buildMcq(ku: KnowledgeUnit, pool: KnowledgeUnit[]): Mcq | null {
  const d = pickDistractors(ku, pool);
  if (d.length < 2) return null;
  const options = seededShuffle([ku.answer.trim(), ...d], ku.id);
  return { ...base("mcq", [ku], 2), template: "mcq", stem: ku.question, options, correctIndex: options.indexOf(ku.answer.trim()) };
}

export function buildCloze(ku: KnowledgeUnit): Cloze | null {
  const s = ku.statement;
  let blank: string | null = null;
  const ans = ku.answer.trim().replace(/[.]+$/, "");
  if (ans && wordCount(ans) <= 4 && normalize(ans).length > 1 && !STOP.has(normalize(ans)) && normalize(s).includes(normalize(ans))) {
    const m = new RegExp(ans.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").exec(s);
    blank = m ? m[0] : null;
  }
  if (!blank) {
    // otherwise the number, or the longest content word
    const num = /\b\d+(?:[-–]\d+)?(?:\.\d+)?\b/.exec(s);
    const word = s.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, "")).filter((w) => w.length >= 5 && !STOP.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    blank = num?.[0] ?? word ?? null;
  }
  if (!blank || STOP.has(blank.toLowerCase())) return null;
  const text = s.replace(blank, "_____");
  if (text === s) return null;
  return { ...base("cloze", [ku], 2), template: "cloze", text, blanks: [{ answer: blank, accept: [blank] }] };
}

/** Steps that have an order become ordering activities: the correct order is the notes' order, not a model's claim (spec 10.3). */
export function buildOrderings(units: KnowledgeUnit[]): Ordering[] {
  const byConcept = new Map<string, KnowledgeUnit[]>();
  for (const u of units) if (u.order && (u.type === "procedure_step" || u.type === "mechanism_step")) byConcept.set(`${u.conceptId}|${u.type}`, [...(byConcept.get(`${u.conceptId}|${u.type}`) ?? []), u]);
  const out: Ordering[] = [];
  for (const group of byConcept.values()) {
    const sorted = [...group].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    // strictly increasing, no ties
    const clean = sorted.filter((u, i) => i === 0 || (u.order ?? 0) > (sorted[i - 1].order ?? 0));
    for (let i = 0; i < clean.length; i += 7) {
      const chunk = clean.slice(i, i + 7);
      if (chunk.length >= 3) out.push({ ...base("ordering", chunk, 3), template: "ordering", items: chunk.map((c) => c.statement) });
    }
  }
  return out;
}

export function buildMatchings(units: KnowledgeUnit[]): Matching[] {
  const out: Matching[] = [];
  const drugs = units.filter((u) => u.type === "drug" && u.extra?.drug && (u.extra.class || u.extra.adverse));
  const pairsOf = (list: KnowledgeUnit[], f: (u: KnowledgeUnit) => { left: string; right: string }) => {
    for (let i = 0; i < list.length; i += 4) {
      const chunk = list.slice(i, i + 4);
      const pairs = chunk.map(f);
      const rights = new Set(pairs.map((p) => normalize(p.right)));
      if (chunk.length >= 3 && rights.size === pairs.length) out.push({ ...base("matching", chunk, 2), template: "matching", pairs });
    }
  };
  pairsOf(drugs, (u) => ({ left: u.extra!.drug, right: (u.extra!.class || u.extra!.adverse)! }));
  const terms = units.filter((u) => (u.type === "vocab" || u.type === "definition") && wordCount(u.question) <= 12 && wordCount(u.answer) <= 6);
  pairsOf(terms, (u) => ({ left: u.question.replace(/[?]+$/, ""), right: u.answer }));
  return out;
}

/** All activities for a library: every fact gets a flip card, and a second, different view when one can be built. */
export function buildActivities(lib: Library): Activity[] {
  const units = active(lib).sort((a, b) => a.source.docId.localeCompare(b.source.docId) || a.source.lineStart - b.source.lineStart);
  const out: Activity[] = [];
  for (const u of units) {
    out.push(buildFlip(u));
    const mcq = buildMcq(u, units);
    if (mcq) out.push(mcq);
    const cloze = buildCloze(u);
    if (cloze) out.push(cloze);
  }
  out.push(...buildOrderings(units), ...buildMatchings(units));
  return out;
}

export interface Grounding {
  ok: boolean;
  reason?: string;
}

const BAD_OPTIONS = /^(all|none) of the above$/i;

/**
 * Spec 9.3: nothing is shown to a student unless it checks out against the notes (R14).
 * `lineText(docId, pageNo, from, to)` returns the cleaned source text of those lines.
 */
export function groundActivity(a: Activity, lib: Library, lineText: (docId: string, pageNo: number, from: number, to: number) => string): Grounding {
  const kus = a.kuIds.map((id) => lib.units[id]);
  if (kus.some((k) => !k || k.status !== "active")) return { ok: false, reason: "cites a fact that does not exist" };
  for (const anchor of a.anchors) {
    if (!fuzzyContains(lineText(anchor.docId, anchor.pageNo, anchor.lineStart, anchor.lineEnd), anchor.excerpt, 0.9)) return { ok: false, reason: "excerpt is not in the notes" };
  }
  const known = kus.map((k) => `${k.statement} ${k.answer} ${Object.values(k.extra ?? {}).join(" ")}`).join(" ");
  const covered = (s: string) => {
    const t = tokens(s);
    if (t.length === 0) return false;
    const have = new Set(tokens(known));
    return t.filter((x) => have.has(x)).length / t.length >= 0.8;
  };
  switch (a.template) {
    case "flip_recall":
      if (!covered(a.answer)) return { ok: false, reason: "answer is not in the cited fact" };
      break;
    case "mcq": {
      const norm = a.options.map(normalize);
      if (a.options.length < 3 || a.options.length > 4) return { ok: false, reason: "needs 3 or 4 options" };
      if (new Set(norm).size !== norm.length) return { ok: false, reason: "duplicate options" };
      if (a.options.some((o) => BAD_OPTIONS.test(o.trim()))) return { ok: false, reason: "'all/none of the above'" };
      if (!covered(a.options[a.correctIndex])) return { ok: false, reason: "right option is not in the cited fact" };
      if (a.options.some((o, i) => i !== a.correctIndex && jaccard(o, a.options[a.correctIndex]) >= 0.8)) return { ok: false, reason: "a wrong option is the same as the right one" };
      break;
    }
    case "cloze": {
      const b = a.blanks[0];
      if (!b || STOP.has(b.answer.toLowerCase()) || !a.text.includes("_____")) return { ok: false, reason: "blank is not a content word" };
      if (!covered(b.answer)) return { ok: false, reason: "blank is not in the cited fact" };
      break;
    }
    case "ordering":
      if (a.items.length < 3 || a.items.length > 7) return { ok: false, reason: "needs 3 to 7 steps" };
      if (a.items.some((it, i) => normalize(it) !== normalize(kus[i].statement))) return { ok: false, reason: "steps are not the notes' steps in order" };
      break;
    case "matching":
      if (a.pairs.length < 3 || a.pairs.length > 5) return { ok: false, reason: "needs 3 to 5 pairs" };
      if (!a.pairs.every((p) => covered(p.left) || covered(p.right))) return { ok: false, reason: "a pair is not in the cited facts" };
      break;
  }
  return { ok: true };
}

export interface BuildReport {
  activities: Activity[];
  dropped: Array<{ id: string; template: string; reason: string }>;
  /** facts covered by at least two different templates */
  coveredTwice: number;
  totalFacts: number;
}

export function buildValidatedActivities(lib: Library, lineText: Parameters<typeof groundActivity>[2]): BuildReport {
  const dropped: BuildReport["dropped"] = [];
  const activities = buildActivities(lib).filter((a) => {
    const g = groundActivity(a, lib, lineText);
    if (!g.ok) dropped.push({ id: a.id, template: a.template, reason: g.reason ?? "failed" });
    return g.ok;
  });
  const templatesByKu = new Map<string, Set<string>>();
  for (const a of activities) for (const k of a.kuIds) templatesByKu.set(k, (templatesByKu.get(k) ?? new Set()).add(a.template));
  const facts = Object.values(lib.units).filter((u) => u.status === "active");
  return { activities, dropped, coveredTwice: facts.filter((f) => (templatesByKu.get(f.id)?.size ?? 0) >= 2).length, totalFacts: facts.length };
}
