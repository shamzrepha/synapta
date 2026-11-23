import { describe, it, expect } from "vitest";
import { availableItems, buildSprint, countForMinutes, needsPaper, recommendedMinutes, summarizeSprint, toCbtItem, topicsOf, type BankQuestion } from "./sprint";

const cbt = (id: string, topic: string): BankQuestion => ({ id, topic, questionText: `Q ${id}`, options: ["a", "b", "c", "d"], correctIndex: 2 });
const th = (id: string, topic: string, text = "Explain the idea of recursion in detail."): BankQuestion => ({ id, topic, questionText: text, marks: 10 });

describe("toCbtItem", () => {
  it("never invents options", () => {
    expect(toCbtItem(th("t", "A"))).toBeNull();
  });
  it("rejects a bad answer index", () => {
    expect(toCbtItem({ ...cbt("x", "A"), correctIndex: 9 })).toBeNull();
  });
  it("uses a stored CBT block when the question has no options of its own", () => {
    const it = toCbtItem({ id: "b", topic: "A", questionText: "long theory", solution: { cbtBlock: { stem: "Which?", options: ["p", "q"], correctIndex: 1 } } });
    expect(it?.stem).toBe("Which?");
    expect(it?.correctIndex).toBe(1);
  });
});

describe("availableItems", () => {
  const bank = [cbt("1", "A"), cbt("2", "B"), th("3", "A"), th("4", "B", "Calculate the time complexity of merge sort.")];
  it("lists only objective items for CBT and only written items for theory", () => {
    expect(availableItems(bank, "cbt", []).map((i) => i.id)).toEqual(["1", "2"]);
    expect(availableItems(bank, "theory", []).filter((i) => i.kind === "theory").map((i) => i.id)).toContain("3");
  });
  it("filters by topic and never asks a question twice in a mixed sprint", () => {
    const m = availableItems(bank, "mixed", ["A"]);
    expect(m.map((i) => i.id).sort()).toEqual(["1", "3"]);
  });
});

describe("buildSprint", () => {
  const items = availableItems([cbt("1", "A"), cbt("2", "A"), cbt("3", "A"), cbt("4", "B"), cbt("5", "C")], "cbt", []);
  it("spreads across topics", () => {
    const s = buildSprint(items, 3, () => 0.5);
    expect(new Set(s.map((i) => i.topic)).size).toBe(3);
  });
  it("never returns more than exist or duplicates", () => {
    const s = buildSprint(items, 50);
    expect(s).toHaveLength(5);
    expect(new Set(s.map((i) => i.id)).size).toBe(5);
  });
});

describe("timing", () => {
  it("recommends about a minute per objective question and longer for written ones", () => {
    expect(recommendedMinutes(Array(30).fill({ kind: "cbt" }))).toBe(30);
    expect(recommendedMinutes([{ kind: "theory" }, { kind: "theory" }])).toBe(15);
    expect(recommendedMinutes([])).toBe(5);
  });
  it("fits a 30 minute sprint", () => {
    expect(countForMinutes(30, "cbt")).toBe(30);
    expect(countForMinutes(30, "theory")).toBe(4);
  });
  it("knows which questions need paper", () => {
    expect(needsPaper("Calculate the current in the circuit.")).toBe(true);
    expect(needsPaper("Define encapsulation.")).toBe(false);
  });
});

describe("summarizeSprint", () => {
  it("scores by topic, weakest first, and counts unanswered as zero", () => {
    const items = availableItems([cbt("1", "A"), cbt("2", "A"), cbt("3", "B")], "cbt", []);
    const r = summarizeSprint(items, { "1": 1, "2": 0 });
    expect(r.pct).toBe(33);
    expect(r.answered).toBe(2);
    expect(r.topics[0].topic).toBe("B");
    expect(r.weakest).toContain("B");
    expect(topicsOf([cbt("1", "A"), cbt("2", "A")])).toEqual([{ topic: "A", count: 2 }]);
  });
});
