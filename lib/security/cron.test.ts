import { describe, it, expect } from "vitest";
import { isCronAuthorized } from "./cron";

describe("isCronAuthorized", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer wrong", "s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer s3cret ", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
  });
  it("refuses everything when no secret is configured", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});
