import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { cleanLines, textToRawLines } from "./clean";
import { buildOutline, templateHint } from "./outline";
import { getPack, detectSubject, loadPacks } from "./packs";
import { extractSection, checkUnit, chunkLines, type Gen } from "./extract";
import { mergeIntoLibrary } from "./merge";
import { auditLibrary, conflictCandidates, numbersIn, resolveConflict } from "./audit";
import { emptyLibrary, stableId, type Concept, type KnowledgeUnit } from "./types";
import { normalize } from "./fuzzy";
import { EMPTY_AI_CONFIG } from "@/lib/ai/structured/types";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), Timestamp: { now: () => ({}) }, FieldValue: { delete: () => ({}) } }));
vi.mock("@/lib/ai/api-key", () => ({ activeGeminiKey: () => "", refreshGeminiKey: async () => undefined }));

const read = (f: string) => fs.readFileSync(`fixtures/worlds/${f}`, "utf8");
const gastro = cleanLines(textToRawLines(read("gastrostomy_sample.txt"))).lines;
const line = (needle: string) => gastro.find((l) => l.text.includes(needle))!;

/** A fake model that "reads" the lines it is given and answers with grounded units, plus one invented one. */
const fakeGen: Gen = (async (opts: { promptVars: { source: string } }) => {
  const has = (s: string) => opts.promptVars.source.includes(s);
  const units = [];
  const pinch = line("Pinch");
  if (has("Pinch")) units.push({ type: "procedure_step", statement: "Pinch the proximal end of the gastrostomy tube to prevent air from entering.", question: "What do you do to the proximal end first?", answer: "Pinch it", order: 1, source: { pageNo: 1, lineStart: pinch.lineNo, lineEnd: pinch.lineNo, excerpt: "Pinch the proximal end of the gastrostomy tube (to prevent air from entering)" } });
  const a = line("Do not use the tube");
  if (has("Do not use the tube")) units.push({ type: "rule", statement: "Do not use the tube for the first 4 to 6 hours after insertion.", question: "How long must the tube not be used after insertion?", answer: "4 to 6 hours", critical: true, source: { pageNo: 1, lineStart: a.lineNo, lineEnd: a.lineNo, excerpt: "Do not use the tube for the first 4-6 hours after insertion." } });
  const c1 = line("1-2 times daily");
  const c2 = line("three times daily");
  if (has("1-2 times daily")) units.push({ type: "nursing_action", statement: "Clean the stoma site 1 to 2 times daily.", question: "How often is the stoma site cleaned?", answer: "1 to 2 times daily", source: { pageNo: 1, lineStart: c1.lineNo, lineEnd: c1.lineNo, excerpt: "Clean the stoma site 1-2 times daily." } });
  if (has("three times daily")) units.push({ type: "nursing_action", statement: "Clean the stoma site daily, three times daily.", question: "How often is the stoma cleaned?", answer: "Three times daily", source: { pageNo: 1, lineStart: c2.lineNo, lineEnd: c2.lineNo, excerpt: "Clean the stoma site daily (three times daily)." } });
  // invented: nothing like it in the notes
  units.push({ type: "drug", statement: "Give omeprazole 20 mg before each feed.", question: "Which drug is given before each feed?", answer: "Omeprazole", source: { pageNo: 1, lineStart: 1, lineEnd: 1, excerpt: "Give omeprazole 20 mg before each feed" } });
  return { data: { units }, meta: { modelId: "fake", repairs: 0, latencyMs: 1, usage: { in: 0, out: 0 } } };
}) as unknown as Gen;

const ctx = (docId: string) => ({ docId, pageNo: 1, pack: getPack("nursing_medical"), tier: "standard" as const, config: EMPTY_AI_CONFIG, templateHint: "procedure" as const, gen: fakeGen });

describe("subject packs", () => {
  it("ships the nursing and general packs as data and detects nursing from the fixture", () => {
    expect(loadPacks().map((p) => p.id)).toEqual(expect.arrayContaining(["nursing_medical", "general"]));
    expect(detectSubject(read("gastrostomy_sample.txt")).packId).toBe("nursing_medical");
    expect(detectSubject("The meeting is on Tuesday at noon and lunch is provided for everyone.").packId).toBe("general");
    expect(getPack("nursing_medical").disclaimer).toMatch(/Not clinical or legal advice/);
  });
});

describe("extraction (S3) with grounding", () => {
  it("keeps grounded units, drops the invented one, and reports it", async () => {
    const sections = buildOutline(gastro);
    const all = await Promise.all(sections.map((s) => extractSection(s, gastro, ctx("docA"))));
    const units = all.flatMap((r) => r.units);
    const dropped = all.flatMap((r) => r.dropped);
    expect(units.some((u) => u.statement.includes("omeprazole"))).toBe(false);
    expect(dropped.some((d) => d.statement.includes("omeprazole") && /excerpt|lines/.test(d.reason))).toBe(true);
    const critical = units.find((u) => u.statement.includes("first 4 to 6 hours"))!;
    expect(critical.critical).toBe(true);
    expect(critical.source.excerpt).toBe("Do not use the tube for the first 4-6 hours after insertion.");
    expect(units.every((u) => u.provenance === "notes" && u.status === "active")).toBe(true);
  });
  it("checks word limits and chunks by tier", () => {
    const base = { type: "rule" as const, question: "q?", answer: "a", source: { pageNo: 1, lineStart: 5, lineEnd: 5, excerpt: "Do not use the tube for the first 4-6 hours after insertion." } };
    expect(checkUnit({ ...base, statement: "word ".repeat(30) }, gastro)).toMatch(/25 words/);
    expect(checkUnit({ ...base, statement: "Do not use the tube." }, gastro)).toBeNull();
    expect(chunkLines(gastro, 60).length).toBeGreaterThan(1);
  });
});

describe("hive-mind merge (S4) and conflict audit (S5)", () => {
  const concept = (name: string, docId: string): Concept => ({ id: stableId("concept", normalize(name)), name, kind: "procedure", summary: "", kuIds: [], docIds: [docId] });
  const ku = (statement: string, docId: string, conceptName: string, extra: Partial<KnowledgeUnit> = {}): KnowledgeUnit => ({
    id: stableId("ku", normalize(statement)), conceptId: concept(conceptName, docId).id, type: "rule", statement, question: "q", answer: "a",
    source: { docId, pageNo: 1, lineStart: 1, lineEnd: 1, excerpt: statement }, alsoIn: [], provenance: "notes", confidence: 0.9, status: "active", tags: [], ...extra,
  });

  it("merges two notes on one topic: shared facts stored once, each note's own facts kept", () => {
    const a = mergeIntoLibrary(emptyLibrary(), { docId: "A", concepts: [concept("Gastrostomy feeding", "A")], units: [ku("Do not use the tube for the first 4 to 6 hours.", "A", "Gastrostomy feeding"), ku("Pinch the tube to prevent air.", "A", "Gastrostomy feeding")] });
    const b = mergeIntoLibrary(a.library, { docId: "B", concepts: [concept("Gastrostomy Feeding", "B")], units: [ku("Do not use the tube for the first 4 to 6 hours.", "B", "Gastrostomy Feeding"), ku("Flush the tube with water after each feed.", "B", "Gastrostomy Feeding")] });
    expect(Object.keys(b.library.concepts)).toHaveLength(1);
    expect(Object.keys(b.library.units)).toHaveLength(3);
    expect(b.log).toMatchObject({ unitsAdded: 1, unitsAlreadyKnown: 1 });
    const shared = Object.values(b.library.units).find((u) => u.statement.startsWith("Do not use"))!;
    expect(shared.alsoIn.map((x) => x.docId)).toEqual(["B"]);
    expect(shared.confidence).toBeGreaterThan(0.9);
    expect(b.library.docIds).toEqual(["A", "B"]);
  });
  it("links similar but different concepts instead of merging them", () => {
    const a = mergeIntoLibrary(emptyLibrary(), { docId: "A", concepts: [concept("Left heart failure signs", "A")], units: [] });
    const b = mergeIntoLibrary(a.library, { docId: "B", concepts: [concept("Right heart failure signs", "B")], units: [] });
    expect(Object.keys(b.library.concepts)).toHaveLength(2);
    expect(b.library.relations.some((r) => r.type === "related_to")).toBe(true);
  });
  it("is idempotent: merging the same notes twice changes nothing", () => {
    const inc = { docId: "A", concepts: [concept("Feeding", "A")], units: [ku("Keep the head raised during feeds.", "A", "Feeding")] };
    const once = mergeIntoLibrary(emptyLibrary(), inc).library;
    const twice = mergeIntoLibrary(once, inc).library;
    expect(Object.keys(twice.units)).toEqual(Object.keys(once.units));
  });

  it("raises the stoma-cleaning conflict and lets the student choose, never choosing for her", async () => {
    expect(numbersIn("daily (three times daily)")).toEqual(["3"]);
    const sections = buildOutline(gastro);
    const units = (await Promise.all(sections.map((s) => extractSection(s, gastro, ctx("docA"))))).flatMap((r) => r.units);
    const lib = mergeIntoLibrary(emptyLibrary(), { docId: "docA", concepts: sections.map((s) => ({ id: stableId("concept", normalize(s.title)), name: s.title, kind: "procedure" as const, summary: "", kuIds: [], docIds: ["docA"] })), units }).library;
    expect(conflictCandidates(Object.values(lib.units))).toHaveLength(1);
    const report = await auditLibrary(lib);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].status).toBe("open");
    const withConflict = { ...lib, conflicts: { [report.conflicts[0].id]: report.conflicts[0] } };
    const chosen = resolveConflict(withConflict, report.conflicts[0].id, report.conflicts[0].kuIdA);
    expect(chosen.conflicts[report.conflicts[0].id].status).toBe("resolved");
    expect(chosen.units[report.conflicts[0].kuIdB].status).toBe("superseded"); // kept, not deleted
    // asking again does not re-raise a conflict the student already answered
    expect((await auditLibrary(chosen)).conflicts).toHaveLength(0);
  });
  it("sends the doc's template hint through", () => {
    expect(["condition", "procedure", "none"]).toContain(templateHint(buildOutline(gastro)));
  });
});

describe("every subject pack is data, and the right pack is found with no code change", () => {
  const read2 = (f: string) => fs.readFileSync(`fixtures/worlds/${f}`, "utf8");
  it("ships packs for all the subjects the spec lists", () => {
    const ids = loadPacks().map((p) => p.id);
    for (const id of ["nursing_medical", "law", "history_social", "literature_arts", "language_learning", "math_physics", "life_sciences", "business_economics", "engineering_cs", "general"]) expect(ids).toContain(id);
  });
  it("detects law, history, maths and language notes from their text", () => {
    expect(detectSubject(read2("law_case_sample.txt")).packId).toBe("law");
    expect(detectSubject(read2("history_sample.txt")).packId).toBe("history_social");
    expect(detectSubject(read2("math_sample.txt")).packId).toBe("math_physics");
    expect(detectSubject(read2("language_sample.txt")).packId).toBe("language_learning");
  });
  it("keeps the safety notice only where it belongs", () => {
    expect(getPack("nursing_medical").disclaimer).toBeTruthy();
    expect(getPack("law").disclaimer).toBeTruthy();
    expect(getPack("math_physics").disclaimer).toBeUndefined();
  });
  it("tells the model never to execute code in the engineering pack (R4)", () => {
    expect(getPack("engineering_cs").pitfalls.join(" ")).toMatch(/never run or execute code/i);
  });
});
