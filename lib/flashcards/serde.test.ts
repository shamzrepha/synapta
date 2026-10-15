import { describe, expect, it } from "vitest";
import { fromStored, isDueStored, newStored, reviewStored, toStored } from "./serde";

const now = new Date("2026-10-15T10:00:00Z");

describe("flashcard FSRS serde", () => {
  it("new cards are due immediately and round-trip through JSON", () => {
    const s = newStored(now);
    expect(isDueStored(s, now)).toBe(true);
    const back = toStored(fromStored(JSON.parse(JSON.stringify(s)), now));
    expect(back).toEqual(s);
  });

  it("good moves the due date forward; again keeps it sooner than easy", () => {
    const base = newStored(now);
    const good = reviewStored(base, "good", now);
    expect(good.reps).toBe(1);
    expect(new Date(good.due).getTime()).toBeGreaterThan(now.getTime());
    expect(isDueStored(good, now)).toBe(false);

    const again = reviewStored(base, "again", now);
    const easy = reviewStored(base, "easy", now);
    expect(new Date(again.due).getTime()).toBeLessThan(new Date(easy.due).getTime());
  });

  it("repeated good reviews grow the interval", () => {
    let s = reviewStored(newStored(now), "good", now);
    const first = new Date(s.due).getTime() - now.getTime();
    let t = new Date(s.due);
    for (let i = 0; i < 3; i++) {
      s = reviewStored(s, "good", t);
      t = new Date(s.due);
    }
    expect(t.getTime() - now.getTime()).toBeGreaterThan(first * 3);
  });

  it("a missing or corrupt stored card is treated as new", () => {
    expect(isDueStored(null, now)).toBe(true);
    expect(fromStored(undefined, now).reps).toBe(0);
  });
});
