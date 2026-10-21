import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { UserRole } from "@/lib/store/use-user-store";
import { ApiError, toErrorResponse } from "@/lib/api/errors";
import { classifyAuthFailure, logAuthFailure } from "@/lib/auth/failures";

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  role: UserRole;
  emailVerified?: boolean;
}

export type AuthUser = AuthenticatedUser;

export class AuthError extends ApiError {
  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string, status: number) {
    super(status, code, message);
    this.name = "AuthError";
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
      logAuthFailure("verifyIdToken", err);
      const f = classifyAuthFailure(err);
      throw new ApiError(f.status === 500 ? 401 : f.status, f.status === 500 ? "UNAUTHENTICATED" : f.code, f.status === 500 ? "We couldn't verify your sign-in. Please sign in again." : f.message);
    }
  } else if (sessionCookie) {
    try {
      decodedToken = await adminAuth().verifySessionCookie(sessionCookie, true);
    } catch (err: unknown) {
      logAuthFailure("verifySessionCookie", err);
      const f = classifyAuthFailure(err);
      throw new ApiError(f.status === 500 ? 401 : f.status, f.status === 500 ? "UNAUTHENTICATED" : f.code, f.status === 500 ? "We couldn't verify your sign-in. Please sign in again." : f.message);
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
    logAuthFailure("userLookup", err);
    // Fail closed for anything privileged: without the user record we cannot confirm the role is current or that the
    // account is not disabled. Ordinary learner requests keep working during a database blip.
    const privileged = (allowedRoles && allowedRoles.length > 0) || role !== "student";
    if (privileged) throw new ApiError(503, "AUTH_UNAVAILABLE", "We couldn't confirm your account right now. Please try again shortly.");
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

export const handleAuthError = toErrorResponse;
