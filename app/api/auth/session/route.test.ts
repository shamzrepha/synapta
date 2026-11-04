import { describe, it, expect, vi } from "vitest";

const createSessionCookie = vi.fn(async (_t: string, o: { expiresIn: number }) => `cookie-for-${o.expiresIn}`);
vi.mock("@/lib/firebase/admin", () => ({ adminAuth: () => ({ verifyIdToken: async () => ({ uid: "u1" }), createSessionCookie }) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: unknown) => POST(new NextRequest("http://x/api/auth/session", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const setCookie = (r: Response) => r.headers.get("set-cookie") || "";

describe("creating the sign-in cookie", () => {
  it("asks Firebase for the full 14 days", async () => {
    await post({ idToken: "t" });
    expect(createSessionCookie).toHaveBeenLastCalledWith("t", { expiresIn: 14 * 24 * 60 * 60 * 1000 });
  });
  it("keep me signed in (the default): the cookie lasts 14 days", async () => {
    expect(setCookie(await post({ idToken: "t" }))).toContain(`Max-Age=${14 * 24 * 60 * 60}`);
    expect(setCookie(await post({ idToken: "t", remember: true }))).toContain(`Max-Age=${14 * 24 * 60 * 60}`);
  });
  it("not ticked: no Max-Age, so the browser forgets it when closed", async () => {
    const c = setCookie(await post({ idToken: "t", remember: false }));
    expect(c).toContain("__session=");
    expect(c.toLowerCase()).not.toContain("max-age");
    expect(c.toLowerCase()).toContain("httponly");
  });
});
