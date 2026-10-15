import { describe, it, expect } from "vitest";
import { canDeletePost, canManage, generateJoinCode, normalizeCode, postTags, sortPosts, validateCommunity } from "./rules";

describe("community rules", () => {
  it("generates readable join codes", () => {
    let n = 0;
    const code = generateJoinCode(() => (n++ % 10) / 10);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    expect(generateJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
  it("normalizes codes", () => {
    expect(normalizeCode(" ab-c 123 ")).toBe("ABC123");
  });
  it("validates communities", () => {
    expect(validateCommunity({ name: "Robotics Club", kind: "club" })).toBeNull();
    expect(validateCommunity({ name: "ab", kind: "club" })).toMatch(/name/);
    expect(validateCommunity({ name: "Valid", kind: "gang" })).toMatch(/Pick/);
    expect(validateCommunity({ name: "Valid", kind: "club", description: "x".repeat(301) })).toMatch(/Description/);
  });
  it("permissions", () => {
    expect(canManage("owner")).toBe(true);
    expect(canManage("member")).toBe(false);
    expect(canManage(null)).toBe(false);
    expect(canDeletePost("owner", "a", "b")).toBe(true);
    expect(canDeletePost("member", "a", "b")).toBe(false);
    expect(canDeletePost("member", "b", "b")).toBe(true);
    expect(canDeletePost(null, "b", "b")).toBe(true);
  });
  it("extracts tags and sorts pinned first", () => {
    expect(postTags("Exam week #Study and #study tips")).toEqual(["study"]);
    const sorted = sortPosts([
      { id: 1, createdAtMs: 5 },
      { id: 2, createdAtMs: 9 },
      { id: 3, createdAtMs: 1, pinned: true },
    ]);
    expect(sorted.map((p) => p.id)).toEqual([3, 2, 1]);
  });
});
