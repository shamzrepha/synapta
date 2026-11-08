import { describe, it, expect } from "vitest";
import { normalizeChallenges, gradeChallenge, toClientChallenge, solutionText, type Challenge } from "./schema";

const base = { prompt: "P", hint: "H", explanation: "E" };
const raw = [
  { type: "choose", ...base, options: ["a", "b", "c"], answer: 1 },
  { type: "number", ...base, unit: "m/s", answer: 12, tolerance: 0.5 },
  { type: "slider", ...base, label: "Mass", unit: "kg", min: 0, max: 10, step: 0.5, start: 1, expr: "x * 2", outLabel: "Force", outUnit: "N", goalMin: 9, goalMax: 11 },
  { type: "order", ...base, items: ["one", "two", "three"] },
  { type: "match", ...base, pairs: [{ left: "A", right: "1" }, { left: "B", right: "2" }, { left: "C", right: "3" }] },
];

describe("quest challenges", () => {
  const cs = normalizeChallenges(raw);
  const by = (t: string) => cs.find((c) => c.type === t) as Challenge;

  it("keeps all valid challenges and numbers them", () => {
    expect(cs.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });
  it("drops unsolvable or malformed ones", () => {
    const bad = [
      { type: "choose", ...base, options: ["a", "b"], answer: 5 },
      { type: "slider", ...base, label: "m", min: 0, max: 10, step: 1, start: 1, expr: "x * 2", outLabel: "f", goalMin: 100, goalMax: 200 },
      { type: "slider", ...base, label: "m", min: 0, max: 10, step: 1, start: 5, expr: "x * 2", outLabel: "f", goalMin: 9, goalMax: 11 },
      { type: "slider", ...base, label: "m", min: 0, max: 10, step: 1, start: 1, expr: "x.constructor", outLabel: "f", goalMin: 1, goalMax: 2 },
      { type: "order", ...base, items: ["same", "same", "x"] },
      { type: "nonsense" },
    ];
    expect(normalizeChallenges(bad)).toEqual([]);
  });
  it("grades each type", () => {
    expect(gradeChallenge(by("choose"), { type: "choose", index: 1 })).toBe(true);
    expect(gradeChallenge(by("choose"), { type: "choose", index: 0 })).toBe(false);
    expect(gradeChallenge(by("number"), { type: "number", value: 12.4 })).toBe(true);
    expect(gradeChallenge(by("number"), { type: "number", value: 13 })).toBe(false);
    expect(gradeChallenge(by("slider"), { type: "slider", x: 5 })).toBe(true);
    expect(gradeChallenge(by("slider"), { type: "slider", x: 8 })).toBe(false);
    expect(gradeChallenge(by("order"), { type: "order", order: ["one", "two", "three"] })).toBe(true);
    expect(gradeChallenge(by("order"), { type: "order", order: ["two", "one", "three"] })).toBe(false);
    const pairs = [{ left: "C", right: "3" }, { left: "A", right: "1" }, { left: "B", right: "2" }];
    expect(gradeChallenge(by("match"), { type: "match", pairs })).toBe(true);
    expect(gradeChallenge(by("match"), { type: "match", pairs: pairs.map((p, i) => (i === 0 ? { ...p, right: "1" } : p)) })).toBe(false);
    expect(gradeChallenge(by("choose"), { type: "number", value: 1 })).toBe(false);
  });
  it("never sends the answer to the browser and shuffles order/match", () => {
    const json = JSON.stringify(cs.map((c) => toClientChallenge(c, () => 0.1)));
    expect(json).not.toContain("explanation");
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('"tolerance"');
    const o = toClientChallenge(by("order"), () => 0.1);
    expect(o.type === "order" && o.items.join()).not.toBe("one,two,three");
  });
  it("explains the right answer in words", () => {
    expect(solutionText(by("choose"))).toBe("b");
    expect(solutionText(by("number"))).toBe("12 m/s");
  });
  it("turns raw maths in the text into readable symbols", () => {
    const [c] = normalizeChallenges([{ type: "number", prompt: "Find $v = \\frac{d}{t}$", hint: "h", explanation: "e", answer: 1, tolerance: 0 }]);
    expect(c.prompt).toBe("Find v = (d)/(t)");
  });
});
