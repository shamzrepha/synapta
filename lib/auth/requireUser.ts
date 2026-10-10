import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { UserRole } from "@/lib/store/use-user-store";

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  role: UserRole;
}

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
  let idToken: string | null = null;

  // 1. Check Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    idToken = authHeader.split("Bearer ")[1]?.trim() || null;
  }

  // 2. Check __session cookie if header was not present
  if (!idToken) {
    const sessionCookie = req.cookies.get("__session");
    if (sessionCookie) {
      idToken = sessionCookie.value;
    }
  }

  if (!idToken) {
    throw new AuthError("UNAUTHENTICATED", "Missing authorization token or session.", 401);
  }

  let decodedToken;
  try {
    // Check if it is a session cookie or an ID token
    try {
      decodedToken = await adminAuth().verifyIdToken(idToken);
    } catch {
      decodedToken = await adminAuth().verifySessionCookie(idToken, true);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Token verification failed";
    throw new AuthError("UNAUTHENTICATED", `Invalid or expired session: ${message}`, 401);
  }

  const uid = decodedToken.uid;
  let role: UserRole = (decodedToken.role as UserRole) || "student";

  // If claim is missing, look up from Firestore user document
  if (!decodedToken.role) {
    try {
      const userDoc = await adminDb().collection("users").doc(uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        if (data?.role) {
          role = data.role as UserRole;
        }
      }
    } catch (e) {
      console.warn("Could not retrieve user document for role check:", e);
    }
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    throw new AuthError("FORBIDDEN", `Access forbidden for role: ${role}`, 403);
  }

  return {
    uid,
    email: decodedToken.email || null,
    role,
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

  const message = error instanceof Error ? error.message : "Internal server error";
  return NextResponse.json(
    {
      ok: false,
      error: { code: "INTERNAL", message },
    },
    { status: 500 }
  );
}
