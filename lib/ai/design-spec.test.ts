import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { designSpec, specMarkdown } from "./design-spec";
import { buildSimulationPrompt } from "@/lib/sim/build";

describe("learning design spec", () => {
  it("keeps docs/ai/LEARNING-DESIGN-SPEC.md identical to the code", () => {
    expect(readFileSync("docs/ai/LEARNING-DESIGN-SPEC.md", "utf8").replace(/\r\n/g, "\n")).toBe(specMarkdown());
  });
  it("selects parts", () => {
    const s = designSpec("common", "class");
    expect(s).toContain("PIECES");
    expect(s).not.toContain("STAGES, ONE PER PIECE");
  });
  it("is injected into the simulation prompt", () => {
    const p = buildSimulationPrompt({ kcTitle: "T", subject: "Physics", level: "university", contextText: "x", objectives: ["a", "b"] });
    expect(p.systemInstruction).toContain("SIMULATION STRUCTURE");
  });
});
