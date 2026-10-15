import { describe, it, expect } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeRedirect("/classes/abc?code=SYN-ABC123")).toBe("/classes/abc?code=SYN-ABC123");
    expect(safeRedirect("/classes/abc/topics/k1")).toBe("/classes/abc/topics/k1");
  });

  it("rejects external and protocol-relative targets", () => {
    expect(safeRedirect("https://evil.example")).toBe("/dashboard");
    expect(safeRedirect("//evil.example/x")).toBe("/dashboard");
    expect(safeRedirect("/\\evil.example")).toBe("/dashboard");
    expect(safeRedirect("%2F%2Fevil.example")).toBe("/dashboard");
    expect(safeRedirect("javascript:alert(1)")).toBe("/dashboard");
  });

  it("never loops back to auth pages", () => {
    expect(safeRedirect("/login?redirect=/x")).toBe("/dashboard");
    expect(safeRedirect("/signup")).toBe("/dashboard");
  });

  it("falls back when missing", () => {
    expect(safeRedirect(null)).toBe("/dashboard");
    expect(safeRedirect("", "/explore")).toBe("/explore");
  });
});
