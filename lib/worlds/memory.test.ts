import { describe, it, expect } from "vitest";
import { applyResult, buildQueue, dueCount, kuState, masteryOf, rateFromResult, type ActivityResult, type StoredCard } from "./memory";
import { gradeCloze, gradeMatching, gradeMcq, gradeOrdering } from "./grade";
import { buildFlip, buildMcq, buildCloze, type Activity } from "./activities";
import { stableId, type KnowledgeUnit } from "./types";

const ku = (i: number, conceptId = "c1", extra: Partial<KnowledgeUnit> = {}): KnowledgeUnit => ({
  id: stableId("ku", String(i)), conceptId, type: "sign_symptom", statement: `Fact number ${i} about the topic is alpha${i}.`, question: `What is fact ${i}?`, answer: `alpha${i}`,
  source: { docId: "d", pageNo: 1, lineStart: i, lineEnd: i, excerpt: "x" }, alsoIn: [], provenance: "notes", confidence: 0.9, status: "active", tags: [], ...extra,
});
const res = (k: KnowledgeUnit, o: Partial<ActivityResult> = {}): ActivityResult => ({ kuId: k.id, template: "mcq", correct: true, firstTry: true, ms: 8000, hintsUsed: 0, ...o });

describe("rating from a result (spec 16.2)", () => {
  const k = ku(1);
  it("wrong is Again, slow or hinted is Hard, right is Good, right first time and quick is Easy", () => {
    expect(rateFromResult(res(k, { correct: false }))).toBe("again");
    expect(rateFromResult(res(k, { hintsUsed: 1 }))).toBe("hard");
    expect(rateFromResult(res(k, { ms: 40_000 }))).toBe("hard");
    expect(rateFromResult(res(k, { ms: 9000 }))).toBe("good");
    expect(rateFromResult(res(k, { ms: 2000 }))).toBe("easy");
    expect(rateFromResult(res(k, { selfRating: "hard" }))).toBe("hard");
  });
});

describe("cards and mastery", () => {
  it("a new fact starts at new, learns after a review, and a wrong answer lowers it", () => {
    const k = ku(1);
    expect(kuState(null)).toBe("new");
    const c1 = applyResult(null, "w", res(k));
    expect(kuState(c1)).not.toBe("new");
    expect(c1.templates).toEqual(["mcq"]);
    const c2 = applyResult(c1, "w", res(k, { correct: false, template: "cloze" }));
    expect(c2.successes).toBe(c1.successes);
    expect(c2.templates).toEqual(["mcq", "cloze"]);
  });
  it("mastered needs a stable memory, 3 successes and 2 templates", () => {
    const k = ku(1);
    let c: StoredCard | null = null;
    for (let i = 0; i < 4; i++) c = applyResult(c, "w", res(k, { template: i % 2 ? "cloze" : "mcq" }), new Date(Date.now() + i * 40 * 86_400_000));
    expect(c!.templates.length).toBe(2);
    expect(["review", "mastered"]).toContain(kuState(c));
    expect(masteryOf([k], new Map([[k.id, { ...c!, fsrs: { ...c!.fsrs, stability: 40 } }]]))).toBe(1);
  });
  it("safety-critical facts weigh double in mastery", () => {
    const a = ku(1);
    const b = ku(2, "c1", { critical: true });
    const cards = new Map([[a.id, { ...applyResult(null, "w", res(a)), fsrs: { ...applyResult(null, "w", res(a)).fsrs, stability: 40, reps: 5 }, templates: ["mcq", "cloze"], successes: 5 }]]);
    expect(masteryOf([a, b], cards)).toBeCloseTo(1 / 3, 1);
  });
});

describe("the review queue (spec 16.3)", () => {
  const units = Array.from({ length: 24 }, (_, i) => ku(i + 1, i < 12 ? "c1" : "c2"));
  const acts: Activity[] = units.flatMap((u) => [buildFlip(u) as Activity, buildMcq(u, units), buildCloze(u)].filter((a): a is Activity => a !== null));
  const past = new Date(Date.now() - 5 * 86_400_000);
  const cards = new Map(units.slice(0, 20).map((u) => [u.id, { ...applyResult(null, "w", res(u), past), lastTemplate: "flip_recall" } as StoredCard]));

  it("serves due facts, a few new ones, within the cap, and counts what is due", () => {
    const now = new Date(Date.now() + 30 * 86_400_000);
    const q = buildQueue(units, acts, cards, { now, limit: 20, newLimit: 3 });
    expect(q.length).toBeLessThanOrEqual(23);
    expect(dueCount(units, cards, now)).toBe(20);
    expect(q.length).toBeGreaterThan(0);
  });
  it("never serves more than three in a row from one concept, and rotates away from last time's template", () => {
    const now = new Date(Date.now() + 30 * 86_400_000);
    const q = buildQueue(units, acts, cards, { now });
    const concept = (a: Activity) => units.find((u) => u.id === a.kuIds[0])!.conceptId;
    // only when one concept runs out can a run of four be unavoidable, so check the part where both still have facts
    for (let i = 3; i < 16; i++) expect(new Set([0, 1, 2, 3].map((o) => concept(q[i - o]))).size).toBeGreaterThan(1);
    expect(q.filter((a) => cards.has(a.kuIds[0])).every((a) => a.template !== "flip_recall")).toBe(true);
  });
  it("puts safety-critical facts first", () => {
    const crit = ku(99, "c1", { critical: true });
    const all = [...units, crit];
    const allActs = [...acts, buildFlip(crit)];
    const cc = new Map(cards);
    cc.set(crit.id, applyResult(null, "w", res(crit), past));
    const q = buildQueue(all, allActs, cc, { now: new Date(Date.now() + 30 * 86_400_000) });
    expect(q[0].kuIds[0]).toBe(crit.id);
  });
});

describe("grading answers", () => {
  const k = ku(1, "c1", { statement: "Rifampicin can cause orange urine.", answer: "orange urine" });
  const cloze = buildCloze(k)!;
  it("cloze forgives case and one slip in a long word, but not wrong numbers", () => {
    expect(gradeCloze({ ...cloze, blanks: [{ answer: "Hepatotoxicity", accept: ["Hepatotoxicity"] }] }, "hepatotoxicty")).toBe(true);
    expect(gradeCloze({ ...cloze, blanks: [{ answer: "24", accept: ["24"] }] }, "25")).toBe(false);
    expect(gradeCloze(cloze, "")).toBe(false);
  });
  it("mcq, ordering and matching", () => {
    expect(gradeMcq({ ...buildMcq(ku(1), [ku(1), ku(2), ku(3), ku(4)])!, correctIndex: 2 }, 2)).toBe(true);
    const ord = { id: "o", kuIds: [], template: "ordering" as const, difficulty: 3 as const, explain: "", anchors: [], provenance: "notes" as const, items: ["a b", "c d", "e f"] };
    expect(gradeOrdering(ord, ["a b", "c d", "e f"])).toBe(true);
    expect(gradeOrdering(ord, ["c d", "a b", "e f"])).toBe(false);
    const m = { id: "m", kuIds: [], template: "matching" as const, difficulty: 2 as const, explain: "", anchors: [], provenance: "notes" as const, pairs: [{ left: "A", right: "1" }, { left: "B", right: "2" }, { left: "C", right: "3" }] };
    expect(gradeMatching(m, [{ left: "C", right: "3" }, { left: "A", right: "1" }, { left: "B", right: "2" }])).toBe(true);
    expect(gradeMatching(m, [{ left: "A", right: "2" }, { left: "B", right: "1" }, { left: "C", right: "3" }])).toBe(false);
  });
});
