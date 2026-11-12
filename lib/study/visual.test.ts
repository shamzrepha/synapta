import { describe, expect, it } from "vitest";
import { settleVisual } from "./visual";

const base = { visual: "none" as const, formula: "", imageQuery: "", wikipediaTitle: "" };
describe("settleVisual", () => {
  it("keeps a formula card with a formula and strips $ signs", () => {
    const r = settleVisual({ ...base, visual: "formula", formula: "$a^2+b^2=c^2$", imageQuery: "x" });
    expect(r.visual).toBe("formula");
    expect(r.formula).toBe("a^2+b^2=c^2");
    expect(r.imageQuery).toBe("");
  });
  it("turns a formula card without a formula into none", () => {
    expect(settleVisual({ ...base, visual: "formula" }).visual).toBe("none");
  });
  it("keeps a picture card only when there is something to search for", () => {
    expect(settleVisual({ ...base, visual: "photo", imageQuery: "resistor" }).visual).toBe("photo");
    expect(settleVisual({ ...base, visual: "diagram" }).visual).toBe("none");
  });
});
