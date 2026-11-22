import { describe, it, expect } from "vitest";
import { summarizeReview } from "./queue";

describe("summarizeReview", () => {
  it("is empty when nothing is due or open", () => {
    const s = summarizeReview({ dueCards: 0, totalCards: 40, decks: [], openMistakes: 0, topics: [] });
    expect(s.empty).toBe(true);
    expect(s.total).toBe(0);
    expect(s.items).toEqual([]);
  });
  it("lists only what is really there, with counts that add up", () => {
    const s = summarizeReview({
      dueCards: 8, totalCards: 40,
      decks: [{ id: "d1", title: "Physics", dueCount: 5 }, { id: "d2", title: "Chem", dueCount: 3 }, { id: "d3", title: "Old", dueCount: 0 }],
      openMistakes: 2, topics: [],
    });
    expect(s.items.map((x) => x.id)).toEqual(["cards", "mistakes"]);
    expect(s.total).toBe(10);
    expect(s.decks.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(s.items[0].detail).toContain("8 cards");
    expect(s.items[0].detail).toContain("2 decks");
  });
  it("links topics to the first due topic and uses singular wording", () => {
    const s = summarizeReview({ dueCards: 1, totalCards: 1, decks: [{ id: "d", title: "A", dueCount: 1 }], openMistakes: 1, topics: [{ classId: "c", kcId: "k", title: "T", dueAt: "2026-11-01" }] });
    expect(s.items.find((x) => x.id === "topics")?.href).toBe("/classes/c/topics/k");
    expect(s.items[0].detail).toContain("1 card ");
    expect(s.items[1].detail).toContain("1 question");
  });
});
