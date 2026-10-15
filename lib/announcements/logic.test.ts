import { describe, it, expect } from "vitest";
import { sortAnnouncements, unreadCount, readStats, cleanText } from "./logic";

describe("sortAnnouncements", () => {
  it("puts pinned first then newest", () => {
    const out = sortAnnouncements([
      { id: "a", pinned: false, createdAt: "2026-01-02" },
      { id: "b", pinned: true, createdAt: "2026-01-01" },
      { id: "c", pinned: false, createdAt: "2026-01-03" },
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("does not mutate input", () => {
    const input = [{ id: "a", pinned: false, createdAt: "1" }, { id: "b", pinned: true, createdAt: "0" }];
    sortAnnouncements(input);
    expect(input[0].id).toBe("a");
  });
});

describe("unreadCount", () => {
  it("counts items not in the read set", () => {
    expect(unreadCount([{ id: "1" }, { id: "2" }, { id: "3" }], new Set(["2"]))).toBe(2);
  });
});

describe("readStats", () => {
  it("ignores readers who are no longer students", () => {
    expect(readStats(["a", "b", "gone", "a"], ["a", "b", "c", "d"])).toEqual({ read: 2, total: 4, percent: 50 });
  });
  it("handles empty class", () => {
    expect(readStats([], [])).toEqual({ read: 0, total: 0, percent: 0 });
  });
});

describe("cleanText", () => {
  it("trims, normalises newlines and truncates", () => {
    expect(cleanText("  hi\r\nthere  ", 100)).toBe("hi\nthere");
    expect(cleanText("abcdef", 3)).toBe("abc");
  });
});
