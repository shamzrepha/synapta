import { describe, it, expect } from "vitest";
import { generateCode, normalizeCode, isSessionOpen, isLate, buildReport, toCsv, clampMinutes, CODE_ALPHABET } from "./logic";

describe("codes", () => {
  it("generates 6 unambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateCode();
      expect(c).toHaveLength(6);
      expect([...c].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
  });
  it("normalizes user input", () => {
    expect(normalizeCode(" ab-cd 23 ")).toBe("ABCD23");
    expect(normalizeCode("ABC")).toBe("");
    expect(normalizeCode("ABCDE0")).toBe("");
  });
});

describe("session timing", () => {
  const s = { openedAt: 1_000_000, expiresAt: 1_000_000 + 10 * 60_000, lateAfterMin: 5 };
  it("is open only inside the window and until closed", () => {
    expect(isSessionOpen(s, 1_000_000)).toBe(true);
    expect(isSessionOpen(s, s.expiresAt)).toBe(false);
    expect(isSessionOpen({ ...s, closed: true }, 1_000_001)).toBe(false);
  });
  it("flags late check-ins", () => {
    expect(isLate(s, s.openedAt + 5 * 60_000)).toBe(false);
    expect(isLate(s, s.openedAt + 5 * 60_000 + 1)).toBe(true);
  });
  it("clamps minutes", () => {
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(9999)).toBe(240);
    expect(clampMinutes("x")).toBe(10);
  });
});

describe("report", () => {
  it("computes percentages, ignores duplicates and unknown sessions", () => {
    const r = buildReport(
      ["s1", "s2", "s3", "s4"],
      [
        { sessionId: "s1", uid: "a", late: false },
        { sessionId: "s1", uid: "a", late: false },
        { sessionId: "s2", uid: "a", late: true },
        { sessionId: "s9", uid: "a", late: false },
        { sessionId: "s1", uid: "outsider", late: false },
      ],
      ["a", "b"]
    );
    expect(r[0]).toMatchObject({ uid: "a", present: 2, late: 1, total: 4, percent: 50 });
    expect(r[1]).toMatchObject({ uid: "b", present: 0, percent: 0 });
  });
  it("handles zero sessions", () => {
    expect(buildReport([], [], ["a"])[0].percent).toBe(0);
  });
});

describe("csv", () => {
  it("quotes and defuses formulas", () => {
    const csv = toCsv([{ name: '=HYPERLINK("x"), Bob', present: 1, late: 0, total: 2, percent: 50 }]);
    expect(csv.split("\n")[0]).toBe("Student,Sessions attended,Late,Total sessions,Attendance %");
    expect(csv.split("\n")[1].startsWith('"\'=HYPERLINK')).toBe(true);
  });
});
