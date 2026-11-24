import { describe, expect, it } from "vitest";
import { cleanParsed, mergeCourse, normCode } from "./courses";

describe("course codes and parsed timetables", () => {
  it("treats spacing and case as the same course", () => {
    expect(normCode("mth 101")).toBe("MTH101");
    expect(normCode("MTH-101")).toBe("MTH101");
  });
  it("keeps good rows, fixes times and drops rubbish", () => {
    const r = cleanParsed(
      {
        courses: [{ code: "mth 101", title: " Elementary Mathematics I " }, { code: "??", title: "x" }],
        slots: [
          { code: "MTH 101", day: "Monday", start: "8am", end: "10:00", venue: "LT1" },
          { code: "PHY 101", day: "Funday", start: "08:00", end: "09:00" },
          { code: "PHY 101", day: "Tue", start: "10:00", end: "09:00" },
          { code: "PHY 101", day: "Wed", start: "14:00", end: "16:00" },
        ],
      },
      100,
    );
    expect(r.courses.map((c) => c.code).sort()).toEqual(["MTH101", "PHY101"]);
    expect(r.courses.find((c) => c.code === "MTH101")).toMatchObject({ title: "Elementary Mathematics I", level: 100 });
    expect(r.slots).toEqual([
      { code: "MTH101", day: "Mon", start: "08:00", end: "10:00", venue: "LT1" },
      { code: "PHY101", day: "Wed", start: "14:00", end: "16:00", venue: "" },
    ]);
  });
  it("marks a course as shared when another department already has it", () => {
    const first = mergeCourse(null, { code: "MTH101", title: "Maths", level: 100, semester: "" }, "Computer Science");
    expect(first.sharedWith).toEqual([]);
    const second = mergeCourse(first.doc, { code: "MTH101", title: "Mathematics I", level: 100, semester: "" }, "Statistics");
    expect(second.sharedWith).toEqual(["computer science"]);
    expect(second.doc.departments).toEqual(["computer science", "statistics"]);
    expect(second.doc.title).toBe("Maths");
  });
});

import { eligibleFor } from "./academic";
describe("a class shared by several departments", () => {
  const student = (department: string) => ({ institutionId: "futo", institution: "FUTO", school: "", department, level: 100, levelSetAt: Date.now(), lockedAt: 0 });
  it("shows to each listed department and no one else", () => {
    const c = { institution: "Federal University of Technology, Owerri (FUTO)", departments: ["Computer Science", "Statistics"], levels: [100] };
    expect(eligibleFor(c, student("Computer Science"))).toBe(true);
    expect(eligibleFor(c, student("statistics"))).toBe(true);
    expect(eligibleFor(c, student("Physics"))).toBe(false);
  });
});
