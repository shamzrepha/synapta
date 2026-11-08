import { describe, it, expect } from "vitest";
import { recommendNext, classProgress, type MapTopic } from "./recommend-next";

const t = (id: string, order: number, pL: number, attempts: number, prerequisiteIds: string[] = []): MapTopic => ({ id, order, pL, attempts, prerequisiteIds });

describe("recommendNext", () => {
  it("starts a new learner at the first topic", () => {
    const r = recommendNext([t("b", 2, 0.2, 0, ["a"]), t("a", 1, 0.2, 0)]);
    expect(r).toMatchObject({ id: "a", kind: "start" });
  });
  it("shores up a shaky topic before moving on", () => {
    const r = recommendNext([t("a", 1, 0.96, 6), t("b", 2, 0.3, 3, ["a"]), t("c", 3, 0.2, 0, ["b"])]);
    expect(r).toMatchObject({ id: "b", kind: "strengthen" });
    expect(r.reason).toContain("30%");
  });
  it("picks the weakest of several shaky topics", () => {
    const r = recommendNext([t("a", 1, 0.35, 4), t("b", 2, 0.1, 2)]);
    expect(r.id).toBe("b");
  });
  it("otherwise moves to the next unmastered topic whose groundwork is solid", () => {
    const r = recommendNext([t("a", 1, 0.97, 8), t("b", 2, 0.2, 0, ["a"]), t("c", 3, 0.2, 0, ["z"]), t("z", 4, 0.2, 0)]);
    expect(r).toMatchObject({ id: "b", kind: "next" });
  });
  it("recommends the unmastered topic even when prerequisites are not solid, since nothing is locked", () => {
    const r = recommendNext([t("a", 1, 0.5, 3), t("b", 2, 0.2, 0, ["a"])]);
    expect(r.id).toBe("a");
  });
  it("says so when everything is mastered, and handles an empty class", () => {
    expect(recommendNext([t("a", 1, 0.99, 9), t("b", 2, 0.96, 5)])).toMatchObject({ id: null, kind: "done" });
    expect(recommendNext([])).toMatchObject({ id: null, kind: "done" });
  });
  it("counts progress", () => {
    expect(classProgress([t("a", 1, 0.99, 9), t("b", 2, 0.5, 2), t("c", 3, 0.99, 0)])).toEqual({ mastered: 1, total: 3 });
  });
});
