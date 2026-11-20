import { describe, it, expect } from "vitest";
import { csvCell } from "./csv";
import { canManageSchool, canAssignTeachers, membershipFor, sponsorshipPatch, makeSchoolCode } from "./policy";

describe("csvCell", () => {
  it("neutralises spreadsheet formulas in names and topics", () => {
    for (const evil of ["=HYPERLINK(\"http://x\",\"a\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
      const cell = csvCell(evil);
      expect(cell.replace(/^"/, "").startsWith("'"), evil).toBe(true);
    }
  });
  it("quotes commas, quotes and line breaks, and leaves plain text and numbers alone", () => {
    expect(csvCell("Ada, Lovelace")).toBe('"Ada, Lovelace"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("Ada")).toBe("Ada");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });
});

describe("who may manage a school", () => {
  const school = { verified: true, principalUid: "p1", teacherUids: ["p1", "t1"] };
  it("allows the admin, the principal and listed teachers only", () => {
    expect(canManageSchool({ uid: "a", role: "admin" }, school)).toBe(true);
    expect(canManageSchool({ uid: "p1", role: "student" }, school)).toBe(true);
    expect(canManageSchool({ uid: "t1", role: "teacher" }, school)).toBe(true);
    expect(canManageSchool({ uid: "x", role: "teacher" }, school)).toBe(false);
    expect(canManageSchool({ uid: "x", role: "student" }, school)).toBe(false);
  });
  it("an unclaimed school (empty principal) is not managed by an anonymous empty uid", () => {
    expect(canManageSchool({ uid: "", role: "student" }, { principalUid: "", teacherUids: [] })).toBe(false);
  });
  it("only the principal or an admin can add teachers", () => {
    expect(canAssignTeachers({ uid: "t1", role: "teacher" }, school)).toBe(false);
    expect(canAssignTeachers({ uid: "p1", role: "student" }, school)).toBe(true);
    expect(canAssignTeachers({ uid: "a", role: "admin" }, school)).toBe(true);
  });
});

describe("one school per account", () => {
  it("joins when free, is idempotent for the same school, refuses a second school", () => {
    expect(membershipFor({}, "s1")).toBe("join");
    expect(membershipFor({ schoolId: "" }, "s1")).toBe("join");
    expect(membershipFor({ schoolId: "s1" }, "s1")).toBe("already_here");
    expect(membershipFor({ schoolId: "s2" }, "s1")).toBe("other_school");
  });
});

describe("sponsorship never overwrites paid time", () => {
  const exp = { toMillis: () => 5_000 };
  it("sponsors free, exam and school accounts", () => {
    expect(sponsorshipPatch({}, exp)).toEqual({ plan: "school", planExpiresAt: exp });
    expect(sponsorshipPatch({ plan: "exam", planExpiresAt: { toMillis: () => 9_999 } }, exp, 1)).toEqual({ plan: "school", planExpiresAt: exp });
  });
  it("leaves an active paid plan alone but sponsors an expired one", () => {
    expect(sponsorshipPatch({ plan: "pro", planExpiresAt: { toMillis: () => 9_999 } }, exp, 1)).toEqual({});
    expect(sponsorshipPatch({ plan: "pro", planExpiresAt: { toMillis: () => 5 } }, exp, 10)).toEqual({ plan: "school", planExpiresAt: exp });
  });
});

describe("school codes", () => {
  it("look like SCH-NAME-123456 and differ between calls", () => {
    const a = makeSchoolCode("Unilag");
    expect(a).toMatch(/^SCH-UNIL-\d{6}$/);
    expect(makeSchoolCode("Be")).toMatch(/^SCH-BEX-\d{6}$/);
    const set = new Set(Array.from({ length: 30 }, () => makeSchoolCode("Unilag")));
    expect(set.size).toBeGreaterThan(25);
  });
});
