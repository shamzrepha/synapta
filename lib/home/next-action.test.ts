import { describe, expect, it } from "vitest";
import { homeState, pickNextAction, summarizeProgress } from "./next-action";

const kcs = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
];

describe("pickNextAction", () => {
  it("continues at the first unfinished topic", () => {
    expect(pickNextAction(kcs, { a: 0.96, b: 0.3 })).toMatchObject({ kind: "continue", kcId: "b", pct: 30 });
  });
  it("starts at topic one for a brand-new learner", () => {
    expect(pickNextAction(kcs, {})).toMatchObject({ kind: "continue", kcId: "a", pct: 0 });
  });
  it("suggests the weakest topic for review when everything is solid", () => {
    expect(pickNextAction(kcs, { a: 0.9, b: 0.75, c: 0.99 })).toMatchObject({ kind: "review", kcId: "b" });
  });
  it("opens a class with no topics", () => {
    expect(pickNextAction([], {})).toEqual({ kind: "open-class" });
  });
  it("ignores out-of-range mastery values", () => {
    expect(pickNextAction(kcs, { a: 7, b: -1 })).toMatchObject({ kcId: "b" });
  });
});

describe("summarizeProgress", () => {
  it("handles no data", () => expect(summarizeProgress([])).toEqual({ tracked: 0, mastered: 0, average: 0 }));
  it("counts mastered topics and averages", () => {
    expect(summarizeProgress([{ pL: 100 }, { pL: 50 }, { pL: 20 }])).toEqual({ tracked: 3, mastered: 1, average: 57 });
  });
});

describe("homeState", () => {
  const base = { loading: false, failed: false, teacher: false, classCount: 2, questsAllDone: false };
  it("covers each state", () => {
    expect(homeState({ ...base, loading: true })).toBe("loading");
    expect(homeState({ ...base, teacher: true })).toBe("teacher");
    expect(homeState({ ...base, failed: true, classCount: 0 })).toBe("error");
    expect(homeState({ ...base, classCount: 0 })).toBe("new");
    expect(homeState(base)).toBe("returning");
    expect(homeState({ ...base, questsAllDone: true })).toBe("done-today");
  });
  it("keeps showing known classes when a refresh fails", () => {
    expect(homeState({ ...base, failed: true })).toBe("returning");
  });
});
