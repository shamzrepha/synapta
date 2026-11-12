import { describe, expect, it } from "vitest";
import { extractRecallItems, toCloze } from "./recall";

describe("toCloze", () => {
  it("blanks the first bold word", () => {
    expect(toCloze("A **diode** lets current flow in one direction only.")).toEqual({ prompt: "A _____ lets current flow in one direction only.", answer: "diode" });
  });
  it("hides the last words when nothing is bold", () => {
    const c = toCloze("Current always flows from the anode towards the cathode.");
    expect(c?.prompt.endsWith("_____")).toBe(true);
    expect(c?.answer.length).toBeGreaterThan(0);
  });
  it("skips fragments that are too short", () => {
    expect(toCloze("Too short")).toBeNull();
  });
});

describe("extractRecallItems", () => {
  const md = `## 1.1 Basics\nText.\n\n## 1.5 Chapter summary\n- A **diode** passes current one way only.\n- The **anode** is the positive side of the part.\n\n## 1.6 Key terms\n- **Cathode**: the negative terminal of a diode.\n- **LED**: a diode that emits light when current flows.\n\n## 1.7 Review questions\n1. Why?`;
  it("mixes cloze prompts from the summary with 'what is' prompts from the key terms", () => {
    const r = extractRecallItems(md, 4);
    expect(r).toHaveLength(4);
    expect(r.some((i) => i.prompt === "What is Cathode?")).toBe(true);
    expect(r.some((i) => i.prompt.includes("_____"))).toBe(true);
  });
  it("returns nothing when the chapter has no summary or key terms", () => {
    expect(extractRecallItems("## Intro\nJust text here.")).toEqual([]);
  });
});
