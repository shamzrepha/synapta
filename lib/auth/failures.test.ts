import { afterEach, describe, expect, it, vi } from "vitest";
import { authFailureToApiError, classifyAuthFailure, logAuthFailure } from "./failures";

const err = (code: string, message = "x") => Object.assign(new Error(message), { code });

describe("classifyAuthFailure", () => {
  it.each([
    ["auth/id-token-expired", 401, "SESSION_EXPIRED"],
    ["auth/session-cookie-expired", 401, "SESSION_EXPIRED"],
    ["auth/id-token-revoked", 401, "UNAUTHENTICATED"],
    ["auth/invalid-id-token", 401, "UNAUTHENTICATED"],
    ["auth/too-many-requests", 429, "TOO_MANY_ATTEMPTS"],
    ["auth/network-request-failed", 503, "AUTH_UNAVAILABLE"],
    ["auth/something-new", 500, "INTERNAL"],
  ])("%s → %i %s", (code, status, outcome) => {
    expect(classifyAuthFailure(err(code))).toMatchObject({ status, code: outcome });
  });

  it("never returns provider text to the client", () => {
    const secret = "Firebase ID token has incorrect 'aud' claim; project my-secret-project";
    const api = authFailureToApiError(err("auth/invalid-id-token", secret));
    expect(api.message).not.toContain("my-secret-project");
    expect(authFailureToApiError(new Error(secret)).status).toBe(500);
  });
});

describe("logAuthFailure", () => {
  afterEach(() => vi.restoreAllMocks());
  it("logs the code and redacts long opaque strings", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const token = "a".repeat(120);
    logAuthFailure("session", err("auth/invalid-id-token", `bad token ${token}`));
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain("auth/invalid-id-token");
    expect(line).not.toContain(token);
  });
});
