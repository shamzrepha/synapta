import { describe, it, expect } from "vitest";
import { askTutor, retrieve } from "./tutor";
import { stableId, type KnowledgeUnit } from "./types";
import type { Gen } from "./extract";

const ku = (s: string, answer = "x"): KnowledgeUnit => ({ id: stableId("ku", s), conceptId: "c", type: "rule", statement: s, question: "q", answer, source: { docId: "d", pageNo: 2, lineStart: 4, lineEnd: 4, excerpt: s }, alsoIn: [], provenance: "notes", confidence: 0.9, status: "active", tags: [] });
const units = [ku("Do not use the tube for the first 4 to 6 hours after insertion."), ku("Leave the tube undisturbed for the first 24 hours."), ku("Orthopnoea is breathlessness when lying flat.")];
const reply = (data: object): Gen => (async () => ({ data, meta: { modelId: "x", repairs: 0, latencyMs: 1, usage: { in: 0, out: 0 } } })) as unknown as Gen;

describe("grounded tutor", () => {
  it("retrieves the facts that share the question's words", () => {
    expect(retrieve("when can the tube be used after insertion", units)[0].statement).toContain("4 to 6 hours");
    expect(retrieve("what about heart failure", units)).toEqual([]);
  });
  it("answers from her notes with the notes they came from", async () => {
    const a = await askTutor("When can I use the tube after insertion?", "simple", units, { gen: reply({ answer: "Not for 4 to 6 hours.", citations: [units[0].id], inNotes: true, aiAdded: null }) });
    expect(a.inNotes).toBe(true);
    expect(a.cited[0].source).toMatchObject({ docId: "d", pageNo: 2 });
    expect(a.aiAdded).toBeNull();
  });
  it("drops a citation the model made up and does not believe 'in my notes' with nothing to point at", async () => {
    const a = await askTutor("tube insertion hours", "exam", units, { gen: reply({ answer: "Wait 10 hours.", citations: ["ku_fake"], inNotes: true, aiAdded: null }) });
    expect(a.cited).toEqual([]);
    expect(a.inNotes).toBe(false);
    expect(a.answer).toMatch(/couldn't tie that to your notes/i);
  });
  it("says so when the notes don't cover it, and labels anything the model adds", async () => {
    expect((await askTutor("What is heart failure?", "simple", units, { gen: reply({ answer: "x", citations: [], inNotes: true, aiAdded: null }) })).answer).toMatch(/couldn't find that in your notes/i);
    const a = await askTutor("tube insertion", "mnemonic", units, { gen: reply({ answer: "Not in your notes.", citations: [], inNotes: false, aiAdded: "Think: 4 to 6, then wait." }) });
    expect(a.inNotes).toBe(false);
    expect(a.aiAdded).toBe("Think: 4 to 6, then wait.");
  });
});
