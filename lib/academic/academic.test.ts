import { describe, it, expect } from "vitest";
import { checkAcademic, eligibleFor, institutionByName, levelNow, sessionsBetween, type Academic } from "./academic";
import { FUTO_SCHOOLS } from "./futo";

const at = (y: number, m: number, d = 15) => Date.UTC(y, m - 1, d);
const base: Academic = { institutionId: "futo", institution: "Federal University of Technology, Owerri (FUTO)", school: FUTO_SCHOOLS[2].name, department: "Mechatronics Engineering", level: 300, levelSetAt: at(2026, 11), lockedAt: at(2026, 11) };

describe("levels move up each academic year", () => {
  it("counts a session from October", () => {
    expect(sessionsBetween(at(2026, 11), at(2027, 6))).toBe(0);
    expect(sessionsBetween(at(2026, 11), at(2027, 10, 2))).toBe(1);
    expect(sessionsBetween(at(2026, 6), at(2026, 11))).toBe(1);
  });
  it("adds a level a year and stops at the last year of the programme", () => {
    expect(levelNow(base, at(2027, 11))).toBe(400);
    expect(levelNow(base, at(2030, 11))).toBe(500);
  });
});

describe("checkAcademic", () => {
  it("accepts a real FUTO school and department", () => {
    const r = checkAcademic({ institutionId: "futo", institution: "", school: "seset", department: "mechatronics engineering", level: 300 });
    expect(r.ok && r.value.department).toBe("Mechatronics Engineering");
  });
  it("rejects a department that is not in that school, and a level beyond the programme", () => {
    expect(checkAcademic({ institutionId: "futo", institution: "", school: "seset", department: "Law", level: 300 }).ok).toBe(false);
    expect(checkAcademic({ institutionId: "futo", institution: "", school: "seset", department: "Mechatronics Engineering", level: 600 }).ok).toBe(false);
  });
  it("lets another school be typed", () => {
    const r = checkAcademic({ institutionId: null, institution: "Some University", department: "Law", level: 200 });
    expect(r.ok && r.value.institutionId).toBeNull();
  });
});

describe("eligibleFor", () => {
  it("shows everything until a student sets their course", () => {
    expect(eligibleFor({ institution: "Other" }, null)).toBe(true);
  });
  it("matches the institution under any spelling, then department and level", () => {
    expect(institutionByName("FUTO")?.id).toBe("futo");
    expect(eligibleFor({ institution: "Federal University of Technology Owerri", department: "Mechatronics Engineering", levels: [300] }, base, at(2026, 12))).toBe(true);
    expect(eligibleFor({ institution: "FUTO", department: "Civil Engineering" }, base)).toBe(false);
    expect(eligibleFor({ institution: "FUTO", levels: [200] }, base, at(2026, 12))).toBe(false);
    expect(eligibleFor({ institution: "FUTO", levels: [400] }, base, at(2027, 12))).toBe(true);
  });
  it("hides classes with no institution unless open, and other schools' classes", () => {
    expect(eligibleFor({}, base)).toBe(false);
    expect(eligibleFor({ open: true }, base)).toBe(true);
    expect(eligibleFor({ institution: "Unilag" }, base)).toBe(false);
  });
});
