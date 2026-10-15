import { describe, it, expect } from "vitest";
import { formatBytes, parseItems, removeItem, totalBytes, upsertItem, type OfflineItem } from "./items";

const mk = (url: string, bytes = 100): OfflineItem => ({ url, page: "/notebook", title: url, bytes, savedAt: "2026-01-01" });

describe("offline items", () => {
  it("parses defensively", () => {
    expect(parseItems("nope")).toEqual([]);
    expect(parseItems([{ url: "https://evil.com/x" }, { url: "/api/a", bytes: -4, page: "javascript:1" }])).toEqual([
      { url: "/api/a", page: "/offline", title: "/api/a", bytes: 0, savedAt: "" },
    ]);
  });
  it("upserts, removes and totals", () => {
    let items = upsertItem([], mk("/api/a", 10));
    items = upsertItem(items, mk("/api/b", 20));
    items = upsertItem(items, mk("/api/a", 30));
    expect(items.map((i) => i.url)).toEqual(["/api/a", "/api/b"]);
    expect(totalBytes(items)).toBe(50);
    expect(removeItem(items, "/api/a").map((i) => i.url)).toEqual(["/api/b"]);
  });
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
