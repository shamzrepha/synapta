import { describe, it, expect } from "vitest";
import { AVATAR_PRESETS, presetAvatarUrl, checkUsername, looksLikeJpeg } from "@/lib/profile/avatars";

describe("avatars and usernames", () => {
  it("builds a small safe SVG for every preset", () => {
    AVATAR_PRESETS.forEach((_, i) => {
      const url = presetAvatarUrl(i)!;
      expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
      expect(url.length).toBeLessThan(1200);
      expect(decodeURIComponent(url)).not.toMatch(/<script|onload|javascript:/i);
    });
    expect(presetAvatarUrl(99)).toBeNull();
  });
  it("accepts good handles and rejects bad or reserved ones", () => {
    expect(checkUsername("  Ada_Obi7 ")).toEqual({ ok: true, username: "ada_obi7" });
    expect(checkUsername("ab").ok).toBe(false);
    expect(checkUsername("has space").ok).toBe(false);
    expect(checkUsername("Admin").ok).toBe(false);
    expect(checkUsername("x".repeat(25)).ok).toBe(false);
  });
  it("recognises a JPEG by its first bytes", () => {
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(true);
    expect(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0]))).toBe(false);
  });
});
