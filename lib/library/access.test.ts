import { describe, it, expect } from "vitest";
import { readRep, repCovers, studentCanSee } from "./access";
import type { Academic } from "@/lib/academic/academic";

const a: Academic = { institutionId: "futo", institution: "Federal University of Technology, Owerri (FUTO)", school: "x", department: "Mechatronics Engineering", level: 300, levelSetAt: Date.UTC(2026, 10, 1), lockedAt: Date.UTC(2026, 10, 1) };
const file = { institutionId: "futo", institution: "FUTO", department: "Mechatronics Engineering", level: 300 };

describe("library access", () => {
  it("a rep covers only their own department", () => {
    const rep = readRep({ courseRep: { institutionId: "futo", institution: "FUTO", department: "Mechatronics Engineering" } });
    expect(repCovers(rep, file)).toBe(true);
    expect(repCovers(rep, { ...file, department: "Civil Engineering" })).toBe(false);
    expect(repCovers(null, file)).toBe(false);
    expect(readRep({})).toBeNull();
  });
  it("a student sees their department, up to their level", () => {
    const now = Date.UTC(2026, 11, 1);
    expect(studentCanSee(a, file, now)).toBe(true);
    expect(studentCanSee(a, { ...file, level: 200 }, now)).toBe(true);
    expect(studentCanSee(a, { ...file, level: 400 }, now)).toBe(false);
    expect(studentCanSee(a, { ...file, level: null }, now)).toBe(true);
    expect(studentCanSee(a, { ...file, department: "Civil Engineering" }, now)).toBe(false);
    expect(studentCanSee(null, file, now)).toBe(false);
  });
});
