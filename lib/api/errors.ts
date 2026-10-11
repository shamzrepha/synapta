import { NextResponse, NextRequest } from "next/server";
import { ZodError, ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Universal error response converter enforcing:
 * `{ ok: false, error: { code, message, ... } }` with accurate HTTP status codes.
 * Masks raw internal 500 error messages while preserving client 4xx status and codes.
 */
export function toErrorResponse(err: unknown, requestId?: string): NextResponse {
  // 1. ApiError or subclass (AuthError, ClassAccessError, QuotaError, AiQuotaExhaustedError)
  if (err instanceof ApiError) {
    const headers = new Headers(err.headers || {});
    const errorPayload: Record<string, unknown> = {
      code: err.code,
      message: err.message,
    };
    if ("resumeAt" in err && (err as { resumeAt?: string }).resumeAt) {
      errorPayload.resumeAt = (err as { resumeAt?: string }).resumeAt;
    }
    return NextResponse.json(
      {
        ok: false,
        error: errorPayload,
      },
      { status: err.status, headers }
    );
  }

  // 2. Zod validation error
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION",
          message: issues || "Invalid request payload",
        },
      },
      { status: 400 }
    );
  }

  // 3. JSON Syntax error (malformed JSON payload)
  if (err instanceof SyntaxError && err.message.toLowerCase().includes("json")) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "BAD_JSON",
          message: "Malformed JSON payload",
        },
      },
      { status: 400 }
    );
  }

  // 4. Duck-typed AI Quota Exhausted error or object
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "AI_QUOTA_EXHAUSTED"
  ) {
    const qErr = err as { code: string; message: string; resumeAt?: string; resumeTimestampMs?: number };
    const retryAfter = qErr.resumeTimestampMs
      ? Math.max(1, Math.ceil((qErr.resumeTimestampMs - Date.now()) / 1000)).toString()
      : "86400";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "AI_QUOTA_EXHAUSTED",
          message: qErr.message,
          ...(qErr.resumeAt ? { resumeAt: qErr.resumeAt } : {}),
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter,
        },
      }
    );
  }

  // Check if an unhandled Error message contains leaked provider exhaustion
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || msg.includes("Quota exceeded")) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AI_QUOTA_EXHAUSTED",
            message: "The AI is at its daily limit. Your upload is saved and will be analysed automatically, or you can retry later.",
          },
        },
        { status: 429 }
      );
    }
  }

  // 5. Duck-typed object with numeric status and string code
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const typedErr = err as {
      status: number;
      code: string;
      message?: string;
      headers?: Record<string, string>;
    };
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: typedErr.code,
          message: typedErr.message || "An error occurred",
        },
      },
      { status: typedErr.status, headers: typedErr.headers }
    );
  }

  // 6. Generic internal 500 error: mask message
  const reqId = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  console.error(`[ApiError:500] Request ${reqId}:`, err);

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Internal error",
        requestId: reqId,
      },
    },
    { status: 500 }
  );
}

/**
 * Parses and validates request JSON body, throwing ApiError(400) on malformed JSON or validation issues.
 */
export async function parseJson<T>(req: NextRequest, schema?: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "BAD_JSON", "Malformed JSON request body");
  }

  if (schema) {
    const result = schema.safeParse(json);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      throw new ApiError(400, "VALIDATION", issues || "Validation failed");
    }
    return result.data;
  }

  return json as T;
}

export const handleAuthError = toErrorResponse;
