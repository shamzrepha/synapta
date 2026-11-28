import { describe, expect, it } from "vitest";
import { checkAcademic, eligibleFor, INDEPENDENT_NAME, INSTITUTIONS, levelNow } from "./academic";

describe("learners who are not in a university", () => {
  const a = checkAcademic({ institution: INDEPENDENT_NAME, department: "", level: 100 });
  it("are accepted without a school or department", () => {
    expect(a).toMatchObject({ ok: true, value: { institutionId: "independent", department: "Self-study" } });
  });
  it("keep their level and only see classes made for everyone", () => {
    if (!a.ok) throw new Error("expected ok");
    const me = { ...a.value, levelSetAt: Date.parse("2020-01-01"), lockedAt: 0 };
    expect(levelNow(me, Date.parse("2026-11-01"))).toBe(100);
    expect(eligibleFor({}, me)).toBe(true);
    expect(eligibleFor({ open: true, institution: "FUTO" }, me)).toBe(true);
    expect(eligibleFor({ institution: "Federal University of Technology, Owerri (FUTO)", department: "Physics" }, me)).toBe(false);
    expect(eligibleFor({ departments: ["Physics"] }, me)).toBe(false);
  });
});

describe("a department that is not in the school's list", () => {
  const base = { institutionId: "futo", institution: "", school: INSTITUTIONS[0].schools[0].name, level: 200 };
  it("is refused unless the student says it is missing", () => {
    expect(checkAcademic({ ...base, department: "Mechatronics" }).ok).toBe(false);
  });
  it("is kept as typed when they say it is missing", () => {
    const r = checkAcademic({ ...base, department: "Mechatronics", unlisted: true });
    expect(r).toMatchObject({ ok: true, value: { department: "Mechatronics" } });
  });
});
