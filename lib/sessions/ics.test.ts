import { describe, it, expect } from "vitest";
import { buildIcs, escapeIcsText, foldLine, applyRsvp } from "./ics";

describe("ics", () => {
  const ics = buildIcs({
    id: "abc",
    title: "Circuits, revision; part 1",
    description: "Line one\nLine two",
    startAt: new Date("2026-05-01T10:00:00Z"),
    endAt: new Date("2026-05-01T11:00:00Z"),
    now: new Date("2026-04-30T00:00:00Z"),
  });
  it("has required fields with CRLF endings", () => {
    expect(ics).toContain("DTSTART:20260501T100000Z");
    expect(ics).toContain("DTEND:20260501T110000Z");
    expect(ics).toContain("UID:abc@sunroot");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
  });
  it("escapes text", () => {
    expect(escapeIcsText("a,b;c\nd")).toBe("a\\,b\\;c\\nd");
    expect(ics).toContain("SUMMARY:Circuits\\, revision\\; part 1");
  });
  it("folds long lines", () => {
    const folded = foldLine("X".repeat(200));
    expect(folded.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});

describe("applyRsvp", () => {
  it("moves a user between lists", () => {
    expect(applyRsvp(["a"], ["b"], "b", "going")).toEqual({ going: ["a", "b"], maybe: [] });
    expect(applyRsvp(["a"], [], "a", "maybe")).toEqual({ going: [], maybe: ["a"] });
    expect(applyRsvp(["a"], ["b"], "a", "none")).toEqual({ going: [], maybe: ["b"] });
  });
  it("does not duplicate", () => {
    expect(applyRsvp(["a"], [], "a", "going").going).toEqual(["a"]);
  });
});
