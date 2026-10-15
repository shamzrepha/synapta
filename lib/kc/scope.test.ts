import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: vi.fn() }));

import { scopeRule, dropOffTopicIdeas } from "./context";
import { buildSimulationPrompt } from "@/lib/sim/build";

const others = ["Resistors", "Ohm's law", "Series and parallel circuits", "Capacitors"];

describe("subtopic scoping", () => {
  it("tells the model to teach only this subtopic and names the topics to avoid", () => {
    const r = scopeRule({ kcTitle: "Resistor color code", objectives: ["[apply] Read a 4-band resistor value"], otherTopics: others });
    expect(r).toContain('ONLY the subtopic "Resistor color code"');
    expect(r).toContain("Read a 4-band resistor value");
    expect(r).not.toContain("[apply]");
    expect(r).toContain("Ohm's law");
    expect(r).toMatch(/Do NOT cover the parent topic/);
  });

  it("puts the scope rule into the simulation builder prompt", () => {
    const p = buildSimulationPrompt({ kcTitle: "Resistor color code", subject: "Electronics", level: "undergrad", contextText: "…", objectives: ["Read a resistor value"], otherTopics: others });
    expect(p.systemInstruction).toContain('ONLY the subtopic "Resistor color code"');
    expect(p.systemInstruction).toContain("Capacitors");
  });

  it("drops ideas that are really about another topic but keeps on-topic ones", () => {
    const ideas = [
      { title: "Color code decoder", learningGoal: "Read resistor values from color bands" },
      { title: "Ohm's law lab", learningGoal: "Relate voltage and current with Ohm's law" },
      { title: "Band hunt", learningGoal: "Match colour bands to digits (resistor color code)" },
    ];
    const kept = dropOffTopicIdeas(ideas, "Resistor color code", others).map((i) => i.title);
    expect(kept).toEqual(["Color code decoder", "Band hunt"]);
  });

  it("keeps everything rather than returning nothing", () => {
    const all = [{ title: "Capacitor charging", learningGoal: "Capacitors store charge" }];
    expect(dropOffTopicIdeas(all, "Resistor color code", others)).toHaveLength(1);
  });

  it("leaves ideas alone when the class has no other topics", () => {
    const ideas = [{ title: "Anything", learningGoal: "x" }];
    expect(dropOffTopicIdeas(ideas, "Resistor color code", [])).toBe(ideas);
  });
});
