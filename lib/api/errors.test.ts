import { describe, it, expect } from "vitest";
import { ApiError, toErrorResponse, parseJson } from "./errors";
import { AuthError } from "@/lib/auth/requireUser";
import { ClassAccessError } from "@/lib/auth/classAccess";
import { QuotaError } from "@/lib/quota/guard";
import { AiQuotaExhaustedError } from "@/lib/ai/router";
import { z } from "zod";
import { NextRequest } from "next/server";

describe("lib/api/errors", () => {
  describe("toErrorResponse", () => {
    it("handles ApiError directly with status, code, and custom headers", async () => {
      const err = new ApiError(403, "FORBIDDEN", "You shall not pass", { "X-Test": "1" });
      const res = toErrorResponse(err);
      expect(res.status).toBe(403);
      expect(res.headers.get("X-Test")).toBe("1");
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "You shall not pass",
        },
      });
    });

    it("handles AuthError (401 and 403)", async () => {
      const err401 = new AuthError("UNAUTHENTICATED", "Token missing", 401);
      const res401 = toErrorResponse(err401);
      expect(res401.status).toBe(401);
      const data401 = await res401.json();
      expect(data401).toEqual({
        ok: false,
        error: { code: "UNAUTHENTICATED", message: "Token missing" },
      });

      const err403 = new AuthError("FORBIDDEN", "Admin required", 403);
      const res403 = toErrorResponse(err403);
      expect(res403.status).toBe(403);
      const data403 = await res403.json();
      expect(data403).toEqual({
        ok: false,
        error: { code: "FORBIDDEN", message: "Admin required" },
      });
    });

    it("handles ClassAccessError (404 / 403)", async () => {
      const err = new ClassAccessError("Classroom not found", "NOT_FOUND", 404);
      const res = toErrorResponse(err);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: { code: "NOT_FOUND", message: "Classroom not found" },
      });
    });

    it("handles QuotaError (429)", async () => {
      const err = new QuotaError("RATE_LIMITED", "Too fast", 429);
      const res = toErrorResponse(err);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Too fast" },
      });
    });

    it("handles AiQuotaExhaustedError with Retry-After and resumeAt", async () => {
      const futureMs = Date.now() + 60000;
      const err = new AiQuotaExhaustedError("midnight Pacific", futureMs);
      const res = toErrorResponse(err);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeTruthy();
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.code).toBe("AI_QUOTA_EXHAUSTED");
      expect(data.error.resumeAt).toBe("midnight Pacific");
    });

    it("handles Zod validation error with 400 and VALIDATION code", async () => {
      const schema = z.object({ age: z.number().min(18) });
      const result = schema.safeParse({ age: 10 });
      if (!result.success) {
        const res = toErrorResponse(result.error);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.ok).toBe(false);
        expect(data.error.code).toBe("VALIDATION");
        expect(data.error.message).toContain("age");
      }
    });

    it("handles JSON SyntaxError with 400 and BAD_JSON code", async () => {
      const err = new SyntaxError("Unexpected token in JSON at position 0");
      const res = toErrorResponse(err);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: {
          code: "BAD_JSON",
          message: "Malformed JSON payload",
        },
      });
    });

    it("intercepts leaked provider quota strings in generic Errors", async () => {
      const err = new Error("RESOURCE_EXHAUSTED: Quota exceeded for metric: generativelanguage.googleapis.com");
      const res = toErrorResponse(err);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.code).toBe("AI_QUOTA_EXHAUSTED");
      expect(data.error.message).not.toContain("generativelanguage.googleapis.com");
    });

    it("masks generic 500 error messages and provides requestId", async () => {
      const err = new Error("FATAL_SQL_QUERY_FAILED: SELECT * FROM secrets");
      const res = toErrorResponse(err, "req_custom_123");
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: {
          code: "INTERNAL",
          message: "Internal error",
          requestId: "req_custom_123",
        },
      });
      expect(data.error.message).not.toContain("secrets");
    });
  });

  describe("parseJson", () => {
    it("parses valid JSON without schema", async () => {
      const req = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ hello: "world" }),
      });
      const data = await parseJson(req);
      expect(data).toEqual({ hello: "world" });
    });

    it("parses valid JSON matching schema", async () => {
      const schema = z.object({ count: z.number() });
      const req = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ count: 42 }),
      });
      const data = await parseJson(req, schema);
      expect(data).toEqual({ count: 42 });
    });

    it("throws ApiError(400, BAD_JSON) on malformed json body", async () => {
      const req = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: "not json at all {",
      });
      try {
        await parseJson(req);
        expect.unreachable("Should have thrown ApiError");
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(400);
        expect((e as ApiError).code).toBe("BAD_JSON");
      }
    });

    it("throws ApiError(400, VALIDATION) on schema validation failure", async () => {
      const schema = z.object({ email: z.string().email() });
      const req = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ email: "invalid-email" }),
      });
      try {
        await parseJson(req, schema);
        expect.unreachable("Should have thrown ApiError");
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(400);
        expect((e as ApiError).code).toBe("VALIDATION");
      }
    });
  });
});
