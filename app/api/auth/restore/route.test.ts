import { describe, it, expect, vi, beforeEach } from "vitest";

const verifySessionCookie = vi.fn();
const createCustomToken = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({ adminAuth: () => ({ verifySessionCookie, createCustomToken }) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const call = (cookie?: string) => POST(new NextRequest("http://x/api/auth/restore", { method: "POST", headers: cookie ? { cookie: `__session=${cookie}` } : {} }));

describe("restoring a sign-in from the session cookie", () => {
  beforeEach(() => {
    verifySessionCookie.mockReset();
    createCustomToken.mockReset();
  });

  it("gives a sign-in token for the account the valid cookie belongs to", async () => {
    verifySessionCookie.mockResolvedValue({ uid: "u1" });
    createCustomToken.mockResolvedValue("custom-token");
    const r = await call("good");
    expect(r.status).toBe(200);
    expect((await r.json()).data.token).toBe("custom-token");
    expect(verifySessionCookie).toHaveBeenCalledWith("good", true); // revoked sessions are refused too
    expect(createCustomToken).toHaveBeenCalledWith("u1");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("says no (401) without a cookie, and never mints a token", async () => {
    const r = await call();
    expect(r.status).toBe(401);
    expect(createCustomToken).not.toHaveBeenCalled();
  });
  it("says no (401) for an expired or revoked cookie", async () => {
    verifySessionCookie.mockRejectedValue({ code: "auth/session-cookie-expired" });
    expect((await call("old")).status).toBe(401);
    verifySessionCookie.mockRejectedValue({ code: "auth/session-cookie-revoked" });
    expect((await call("revoked")).status).toBe(401);
    expect(createCustomToken).not.toHaveBeenCalled();
  });
  it("says 'can't tell' (503), not 'no', when our own service fails, so the browser keeps the cookie", async () => {
    verifySessionCookie.mockRejectedValue({ code: "auth/network-request-failed" });
    expect((await call("x")).status).toBe(503);
    verifySessionCookie.mockResolvedValue({ uid: "u1" });
    createCustomToken.mockRejectedValue(new Error("signing failed"));
    expect((await call("x")).status).toBe(503);
  });
});
