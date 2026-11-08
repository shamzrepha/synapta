import { describe, it, expect } from "vitest";
import { FEATURES } from "./registry";
import { groupByIntent, intentOf, INTENT_ORDER } from "./intents";

describe("feature intents", () => {
  it("puts capture, practice and planning tools where people look for them", () => {
    const byId = Object.fromEntries(FEATURES.map((f) => [f.id, intentOf(f)]));
    expect(byId.notes).toBe("Capture");
    expect(byId.snap).toBe("Capture");
    expect(byId.flashcards).toBe("Practice");
    expect(byId.exams).toBe("Plan");
  });
  it("gives every live feature an intent and never loses one when grouping", () => {
    const items = FEATURES.filter((f) => f.status === "live").map((f) => ({ id: f.id, intent: intentOf(f) }));
    const grouped = groupByIntent(items);
    expect(grouped.reduce((n, g) => n + g.items.length, 0)).toBe(items.length);
    for (const g of grouped) expect(INTENT_ORDER).toContain(g.intent);
  });
  it("keeps groups in the fixed order and drops empty ones", () => {
    const g = groupByIntent([{ intent: "Practice" as const }, { intent: "Capture" as const }]);
    expect(g.map((x) => x.intent)).toEqual(["Capture", "Practice"]);
  });
});
