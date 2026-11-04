import { describe, it, expect } from "vitest";
import { SESSION_DAYS, SESSION_MS, sessionCookieOptions } from "./session-cookie";

describe("the sign-in cookie", () => {
  it("lasts the 14 days Firebase allows", () => {
    expect(SESSION_DAYS).toBe(14);
    expect(SESSION_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
  it("keep-me-signed-in on: lasts 14 days; off: no max-age, so it ends when the browser closes", () => {
    expect(sessionCookieOptions(true, true).maxAge).toBe(14 * 24 * 60 * 60);
    expect("maxAge" in sessionCookieOptions(false, true)).toBe(false);
  });
  it("is always HttpOnly, same-site lax, site-wide, and secure in production only", () => {
    for (const remember of [true, false]) expect(sessionCookieOptions(remember, true)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: true });
    expect(sessionCookieOptions(true, false).secure).toBe(false);
  });
});
