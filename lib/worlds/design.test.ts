import { describe, it, expect } from "vitest";
import { buildActivities, buildCloze, buildMcq, groundActivity, buildValidatedActivities, pickDistractors } from "./activities";
import { buildBeats, designWorld } from "./design";
import { normalize } from "./fuzzy";
import { emptyLibrary, stableId, type Concept, type KnowledgeUnit, type Library } from "./types";

function lib(): Library {
  const l = emptyLibrary();
  const concept = (name: string, topic: string): Concept => {
    const c: Concept = { id: stableId("concept", normalize(name)), name, kind: "condition", summary: "", kuIds: [], docIds: ["d1"], topic };
    l.concepts[c.id] = c;
    return c;
  };
  let line = 1;
  const add = (c: Concept, type: KnowledgeUnit["type"], statement: string, answer: string, extra: Partial<KnowledgeUnit> = {}) => {
    const u: KnowledgeUnit = { id: stableId("ku", normalize(statement)), conceptId: c.id, type, statement, question: `Question about: ${statement.split(" ").slice(0, 6).join(" ")}?`, answer, source: { docId: "d1", pageNo: 1, lineStart: line, lineEnd: line, excerpt: statement }, alsoIn: [], provenance: "notes", confidence: 0.9, status: "active", tags: [], ...extra };
    line++;
    l.units[u.id] = u;
    c.kuIds.push(u.id);
  };
  const copd = concept("COPD", "Respiratory causes");
  add(copd, "definition", "COPD is a chronic lung disease that limits airflow.", "limits airflow");
  add(copd, "sign_symptom", "Chronic cough is a common sign of COPD.", "Chronic cough");
  add(copd, "sign_symptom", "Wheezing is heard on auscultation in asthma.", "Wheezing");
  add(copd, "cause", "Smoking is the commonest cause of COPD.", "Smoking");
  ["Irritant exposure", "Chronic inflammation", "Airway narrowing", "Air trapping", "Hypoxaemia"].forEach((s, i) => add(copd, "mechanism_step", `${s} follows in the chain of COPD changes.`, s, { order: i + 1 }));
  const tb = concept("Tuberculosis drugs", "Drugs");
  [["Isoniazid", "Anti-TB", "Hepatotoxicity"], ["Rifampicin", "Rifamycin", "Orange urine"], ["Ethambutol", "Antimycobacterial", "Optic neuritis"], ["Pyrazinamide", "Antimycobacterial agent", "Gout"]].forEach(([d, c, adv]) =>
    add(tb, "drug", `${d} is a ${c} drug that can cause ${adv}.`, c, { extra: { drug: d, class: c, adverse: adv } })
  );
  add(tb, "rule", "Do not give isoniazid without monitoring liver function.", "monitoring liver function", { critical: true });
  return l;
}
const text = (l: Library) => (_d: string, _p: number, a: number, b: number) =>
  Object.values(l.units).filter((u) => u.source.lineStart >= a && u.source.lineStart <= b).map((u) => u.source.excerpt).join(" ");

describe("activities from the notes", () => {
  const l = lib();
  const report = buildValidatedActivities(l, text(l));

  it("gives every fact a flip card and most a second, different view", () => {
    expect(report.activities.filter((a) => a.template === "flip_recall")).toHaveLength(Object.keys(l.units).length);
    expect(report.coveredTwice / report.totalFacts).toBeGreaterThan(0.7);
  });
  it("builds ordering from the notes' order, matching from drugs, and never from a model", () => {
    const ord = report.activities.find((a) => a.template === "ordering");
    expect(ord && ord.template === "ordering" && ord.items[0]).toMatch(/Irritant exposure/);
    expect(ord && ord.template === "ordering" && ord.items).toHaveLength(5);
    const m = report.activities.find((a) => a.template === "matching");
    expect(m && m.template === "matching" && m.pairs.map((p) => p.left)).toEqual(expect.arrayContaining(["Isoniazid", "Rifampicin"]));
  });
  it("mcq: one right option, distractors from related facts, position chosen by the app", () => {
    const ku = Object.values(l.units).find((u) => u.statement.startsWith("Smoking"))!;
    const q = buildMcq(ku, Object.values(l.units))!;
    expect(q.options[q.correctIndex]).toBe("Smoking");
    expect(new Set(q.options.map(normalize)).size).toBe(q.options.length);
    expect(q.options.some((o) => /all of the above/i.test(o))).toBe(false);
    expect(buildMcq(ku, Object.values(l.units))!.options).toEqual(q.options); // deterministic
    expect(pickDistractors(ku, [ku])).toEqual([]);
  });
  it("cloze: blanks a content word, never a stop word, and the answer is in the statement", () => {
    const ku = Object.values(l.units).find((u) => u.statement.startsWith("Chronic cough"))!;
    const c = buildCloze(ku)!;
    expect(c.text).toContain("_____");
    expect(c.blanks[0].answer.toLowerCase()).toBe("chronic cough");
  });
  it("grounding rejects a made-up excerpt, a missing fact and a duplicate option", () => {
    const ku = Object.values(l.units)[0];
    const flip = buildActivities(l).find((a) => a.kuIds[0] === ku.id)!;
    expect(groundActivity(flip, l, text(l)).ok).toBe(true);
    expect(groundActivity({ ...flip, anchors: [{ ...flip.anchors[0], excerpt: "Give omeprazole before each feed" }] }, l, text(l))).toMatchObject({ ok: false, reason: expect.stringMatching(/excerpt/) });
    expect(groundActivity({ ...flip, kuIds: ["nope"] }, l, text(l)).ok).toBe(false);
    const mcq = report.activities.find((a) => a.template === "mcq")!;
    if (mcq.template === "mcq") expect(groundActivity({ ...mcq, options: [mcq.options[0], mcq.options[0], mcq.options[1]] }, l, text(l)).ok).toBe(false);
  });
  it("marks safety-critical facts", () => {
    expect(report.activities.some((a) => a.critical)).toBe(true);
  });
});

describe("world design", () => {
  const l = lib();
  const acts = buildValidatedActivities(l, text(l)).activities;
  const w = designWorld(l, acts);
  it("makes a zone per topic, nodes of sensible size, and every fact lands in exactly one node", () => {
    expect(w.zones.map((z) => z.title)).toEqual(expect.arrayContaining(["Respiratory causes", "Drugs"]));
    const all = w.nodes.flatMap((n) => n.kuIds);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(Object.keys(l.units).length);
    expect(w.zones.length).toBeLessThanOrEqual(8);
    for (const n of w.nodes) expect(n.title.split(" ").length).toBeLessThanOrEqual(6);
  });
  it("teaches in short beats, each followed by a check, then a recap, all from the notes", () => {
    const node = w.nodes[0];
    expect(node.beats[0].kind).toBe("teach");
    expect(node.beats.some((b) => b.kind === "check")).toBe(true);
    expect(node.beats[node.beats.length - 1].kind).toBe("recap");
    for (const b of node.beats.filter((x) => x.kind === "teach")) {
      expect(b.text.split(/\s+/).length).toBeLessThanOrEqual(90);
      for (const id of b.kuIds) expect(l.units[id]).toBeTruthy();
    }
    expect(buildBeats([], [], "n")).toEqual([]);
  });
  it("is deterministic and gives each zone a boss that draws from its nodes", () => {
    expect(designWorld(l, acts)).toEqual(w);
    expect(w.zones.every((z) => z.boss.pool.length > 0)).toBe(true);
  });
});
