import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { UserRole } from "@/lib/store/use-user-store";

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  role: UserRole;
  emailVerified?: boolean;
}

export type AuthUser = AuthenticatedUser;

export class AuthError extends Error {
  code: "UNAUTHENTICATED" | "FORBIDDEN";
  status: number;

  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export async function requireUser(
  req: NextRequest,
  allowedRoles?: UserRole[]
): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get("authorization");
  const sessionCookie = req.cookies.get("__session")?.value;

  let decodedToken;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.split("Bearer ")[1]?.trim();
    if (!bearerToken) {
      throw new AuthError("UNAUTHENTICATED", "Malformed Bearer token.", 401);
    }
    try {
      decodedToken = await adminAuth().verifyIdToken(bearerToken, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ID token verification failed";
      throw new AuthError("UNAUTHENTICATED", `Invalid or revoked token: ${msg}`, 401);
    }
  } else if (sessionCookie) {
    try {
      decodedToken = await adminAuth().verifySessionCookie(sessionCookie, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Session cookie verification failed";
      throw new AuthError("UNAUTHENTICATED", `Invalid or revoked session: ${msg}`, 401);
    }
  } else {
    throw new AuthError("UNAUTHENTICATED", "Missing authorization header or session cookie.", 401);
  }

  const uid = decodedToken.uid;
  let role: UserRole = (decodedToken.role as UserRole) || "student";

  // Check Firestore user record for disabled status and role consistency
  try {
    const userDoc = await adminDb().collection("users").doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data?.disabled === true) {
        throw new AuthError("FORBIDDEN", "This account has been disabled by an administrator.", 403);
      }
      if (data?.role) {
        role = data.role as UserRole;
      }
    }
  } catch (err) {
    if (err instanceof AuthError) throw err;
    console.warn("Could not retrieve user document for disabled/role check:", err);
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    throw new AuthError("FORBIDDEN", `Access forbidden for role: ${role}`, 403);
  }

  return {
    uid,
    email: decodedToken.email || null,
    role,
    emailVerified: !!decodedToken.email_verified,
  };
}

export function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: error.code, message: error.message },
      },
      { status: error.status }
    );
  }

  // Check for typed AI Quota Exhausted error
  if (
    (typeof error === "object" && error !== null && (error as { code?: string }).code === "AI_QUOTA_EXHAUSTED") ||
    (error instanceof Error && error.name === "AiQuotaExhaustedError")
  ) {
    const resumeAt = (error as { resumeAt?: string }).resumeAt;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "AI_QUOTA_EXHAUSTED",
          message: error instanceof Error ? error.message : "The AI is at its daily limit. Your upload is saved and will be analysed automatically.",
          resumeAt,
        },
      },
      { status: 429 }
    );
  }

  let message = error instanceof Error ? error.message : "Internal server error";

  // Prevent leaking raw provider JSON to users
  if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429") || message.includes("Quota exceeded")) {
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

  if (message.startsWith("{") && message.includes('"error"')) {
    message = "An error occurred during AI processing. Please retry.";
  }

  return NextResponse.json(
    {
      ok: false,
      error: { code: "INTERNAL", message },
    },
    { status: 500 }
  );
}
