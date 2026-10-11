import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError, AuthUser } from "@/lib/auth/requireUser";
import { UserRole } from "@/lib/store/use-user-store";
import { z } from "zod";
import crypto from "crypto";

export interface WithApiOptions<TBody = unknown> {
  roles?: UserRole[];
  schema?: z.ZodSchema<TBody>;
}

export type ApiContext<TBody = unknown> = {
  user: AuthUser | null;
  body: TBody;
  requestId: string;
};

export type ApiHandler<TResult = unknown, TBody = unknown> = (
  req: NextRequest,
  ctx: ApiContext<TBody>
) => Promise<NextResponse<TResult> | Response>;

/**
 * Higher-order API route wrapper that standardizes authentication, payload validation,
 * request IDs, structured logging, and uniform contract error handling.
 */
export function withApi<TResult = unknown, TBody = unknown>(
  handler: ApiHandler<TResult, TBody>,
  options: WithApiOptions<TBody> = {}
) {
  return async (req: NextRequest): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // 1. Authentication & Role Authorization
      let user: AuthUser | null = null;
      if (options.roles && options.roles.length > 0) {
        user = await requireUser(req, options.roles);
      } else {
        try {
          user = await requireUser(req);
        } catch {
          // Unauthenticated allowed when no explicit roles required
          user = null;
        }
      }

      // 2. Body validation if schema provided
      let validatedBody = undefined as unknown as TBody;
      if (options.schema) {
        const bodyJson = await req.json().catch(() => ({}));
        const parsed = options.schema.safeParse(bodyJson);
        if (!parsed.success) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "VALIDATION",
                message: parsed.error.issues[0]?.message || "Validation failed",
              },
            },
            { status: 400, headers: { "x-request-id": requestId } }
          );
        }
        validatedBody = parsed.data;
      }

      // 3. Execution
      const res = await handler(req, { user, body: validatedBody, requestId });

      // Append request id header
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      console.warn(`[API ERROR] ${req.method} ${req.nextUrl.pathname} (reqId: ${requestId}, ${duration}ms):`, err instanceof Error ? err.message : err);

      const authRes = handleAuthError(err);
      authRes.headers.set("x-request-id", requestId);
      return authRes;
    }
  };
}
