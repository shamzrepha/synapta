import { describe, it, expect } from "vitest";
import { parseCost, formatNaira, bomFor } from "./bom";
import { buildGuide, describePin, readmeMarkdown, fileSlug } from "./guide";
import { validateEntry, pickWinner, isClosed, contestSchema } from "./contest";
import { parseVideoUrl, featured, filterWall, wallScore, type WallItem } from "./wall";
import { TEMPLATES, templateSolution } from "./templates";
import { parseSpec } from "./spec";

const circuitSpec = (() => {
  const t = TEMPLATES.find((x) => x.id === "traffic-light")!;
  return templateSolution(t);
})();

describe("shop price parsing", () => {
  it("reads naira strings", () => {
    expect(parseCost("₦3,000")).toBe(3000);
    expect(parseCost("₦50")).toBe(50);
    expect(parseCost("₦1,500–2,000")).toBe(2000);
    expect(parseCost("free")).toBe(0);
    expect(parseCost(undefined)).toBe(0);
    expect(formatNaira(12000)).toBe("₦12,000");
  });
});

describe("bill of materials and guide", () => {
  it("counts parts and totals with shop prices", () => {
    const bom = bomFor(circuitSpec);
    const leds = bom.lines.find((l) => l.type === "led")!;
    expect(leds.qty).toBe(3);
    expect(bom.total).toBe(bom.lines.reduce((s, l) => s + l.qty * l.unit, 0));
    expect(bom.total).toBeGreaterThan(0);
  });

  it("describes wires in words and builds a readme", () => {
    const g = buildGuide("Traffic light", circuitSpec);
    expect(g.wires.length).toBe(circuitSpec.circuit!.wires.length);
    expect(g.wires[0].sentence).toMatch(/^Connect .* to .*\.$/);
    expect(g.safety.length).toBeGreaterThan(3);
    const md = readmeMarkdown("Traffic light", circuitSpec, { author: "Ada" });
    expect(md).toContain("# Traffic light");
    expect(md).toContain("## Parts list");
    expect(md).toContain("## Wiring");
    expect(describePin(circuitSpec, "board.D13")).toContain("board's D13");
    expect(fileSlug("My Robot!! v2")).toBe("my-robot-v2");
  });

  it("includes datasheet warnings for verified parts", () => {
    const t = TEMPLATES.find((x) => x.id === "line-follower")!;
    const g = buildGuide(t.title, templateSolution(t));
    expect(g.warnings.some((w) => w.type === "l298n" && w.warnings.length > 0)).toBe(true);
  });
});

describe("contest entries", () => {
  it("rejects over-budget and disallowed parts, accepts a fitting design", () => {
    const total = bomFor(circuitSpec).total;
    expect(validateEntry(circuitSpec, { budget: total, allowedParts: [] }).problems.filter((p) => /budget|allowed/.test(p))).toEqual([]);
    const over = validateEntry(circuitSpec, { budget: total - 1, allowedParts: [] });
    expect(over.ok).toBe(false);
    expect(over.problems.join(" ")).toMatch(/over the/);
    const lf = templateSolution(TEMPLATES.find((x) => x.id === "line-follower")!);
    const banned = validateEntry(lf, { budget: 1_000_000, allowedParts: ["buzzer"] });
    expect(banned.problems.join(" ")).toMatch(/Not allowed/);
  }, 60_000);

  it("rejects an empty circuit", () => {
    const empty = parseSpec({ kind: "assembly" });
    expect(validateEntry(empty, { budget: 1000, allowedParts: [] }).ok).toBe(false);
  });

  it("picks winners, ties to the earlier entry", () => {
    expect(pickWinner([])).toBeNull();
    const w = pickWinner([
      { uid: "a", votes: 2, createdAt: "2026-01-02" },
      { uid: "b", votes: 3, createdAt: "2026-01-03" },
      { uid: "c", votes: 3, createdAt: "2026-01-01" },
    ]);
    expect(w!.uid).toBe("c");
  });

  it("knows when a contest is closed", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(isClosed({ status: "open", deadline: "2026-10-16T00:00:00Z" }, now)).toBe(false);
    expect(isClosed({ status: "open", deadline: "2026-10-15T00:00:00Z" }, now)).toBe(true);
    expect(isClosed({ status: "closed", deadline: "2030-01-01T00:00:00Z" }, now)).toBe(true);
    expect(contestSchema.safeParse({ title: "Go", brief: "short", deadline: "x", budget: 1 }).success).toBe(false);
  });
});

describe("maker wall", () => {
  it("parses video links", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ kind: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideoUrl("youtu.be/dQw4w9WgXcQ")).toMatchObject({ kind: "youtube" });
    expect(parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toMatchObject({ kind: "youtube" });
    expect(parseVideoUrl("https://vimeo.com/123456789")).toMatchObject({ kind: "vimeo", embed: "https://player.vimeo.com/video/123456789" });
    expect(parseVideoUrl("/api/media/posts/u1/abc.mp4")).toMatchObject({ kind: "upload" });
    expect(parseVideoUrl("https://evil.example/video.mp4")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl("")).toBeNull();
  });

  const mk = (id: string, daysAgo: number, stars: number, over: Partial<WallItem> = {}): WallItem => ({
    id, title: id, kind: "circuit", ownerName: "x", description: "d", video: null, coverUrl: null, starCount: stars, forkCount: 0,
    publishedAt: new Date(Date.parse("2026-10-15T00:00:00Z") - daysAgo * 86400000).toISOString(), partTypes: ["led"], total: 0, ...over,
  });

  it("features recent winners first, filling with older ones", () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    const items = [mk("old-big", 30, 50), mk("new-small", 1, 1), mk("new-big", 2, 9)];
    expect(featured(items, now, 2).map((i) => i.id)).toEqual(["new-big", "new-small"]);
    expect(featured(items, now, 3).map((i) => i.id)).toEqual(["new-big", "new-small", "old-big"]);
    expect(wallScore(mk("a", 0, 2, { forkCount: 3 }))).toBe(8);
  });

  it("filters by kind, part and text", () => {
    const items = [mk("a", 1, 1, { partTypes: ["led", "servo"] }), mk("b", 1, 1, { kind: "mechanism", partTypes: [] })];
    expect(filterWall(items, { part: "servo" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterWall(items, { kind: "mechanism" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterWall(items, { q: "B" }).map((i) => i.id)).toEqual(["b"]);
  });
});
