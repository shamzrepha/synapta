import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { UserRole } from "@/lib/store/use-user-store";
import { z } from "zod";

export const runtime = "nodejs";

const bootstrapBodySchema = z.object({
  roleRequest: z.enum(["none", "pending"]).optional().default("none"),
  displayName: z.string().optional(),
  username: z.string().optional(),
  photoURL: z.string().nullable().optional(),
});

function sanitizeUsername(input?: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer token required" } },
        { status: 401 }
      );
    }

    const idToken = authHeader.split("Bearer ")[1]?.trim();
    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHENTICATED", message: "Invalid Bearer token" } },
        { status: 401 }
      );
    }

    const decoded = await adminAuth().verifyIdToken(idToken);
    const { uid, email } = decoded;
    const normalizedEmail = (email || "").toLowerCase().trim();

    const bodyJson = await req.json().catch(() => ({}));
    const parsed = bootstrapBodySchema.safeParse(bodyJson);
    const { roleRequest, displayName, username, photoURL } = parsed.success
      ? parsed.data
      : { roleRequest: "none" as const, displayName: undefined, username: undefined, photoURL: undefined };

    const env = getServerEnv();
    const adminEmails = env.ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isEmailVerified = !!decoded.email_verified;
    const isWhitelistedAdminEmail =
      !!normalizedEmail &&
      (adminEmails.includes(normalizedEmail) ||
        normalizedEmail === "shamzypre14@gmail.com");

    const grantAdmin = isWhitelistedAdminEmail && isEmailVerified;
    const adminPendingVerification = isWhitelistedAdminEmail && !isEmailVerified;

    const userRef = adminDb().collection("users").doc(uid);
    const userDoc = await userRef.get();

    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
    let role: UserRole = grantAdmin ? "admin" : "student";
    let userData;

    // Determine clean display name and username
    const resolvedDisplayName =
      displayName ||
      decoded.name ||
      (normalizedEmail ? normalizedEmail.split("@")[0] : "Learner");

    const defaultUsernameSeed = sanitizeUsername(
      username ||
        (normalizedEmail ? normalizedEmail.split("@")[0] : "") ||
        decoded.name ||
        `user_${uid.slice(0, 6)}`
    ) || `user_${uid.slice(0, 6)}`;

    if (!userDoc.exists) {
      // Create fresh user profile
      const defaultTokenLimit = grantAdmin
        ? 1_000_000
        : roleRequest === "pending"
        ? env.TEACHER_TOKEN_LIMIT
        : env.STUDENT_TOKEN_LIMIT;

      userData = {
        uid,
        email: email || null,
        displayName: resolvedDisplayName,
        username: defaultUsernameSeed,
        photoURL: photoURL || decoded.picture || null,
        role,
        roleRequest: grantAdmin ? "none" : roleRequest,
        xp: 0,
        streakDays: 1,
        lastActiveDate: new Date().toISOString().split("T")[0],
        monthlyTokenLimit: defaultTokenLimit,
        monthlyTokensUsed: 0,
        usagePeriod: currentPeriod,
        disabled: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await userRef.set(userData);
    } else {
      // Existing user
      const existing = userDoc.data()!;
      const existingRole = (existing.role as UserRole) || "student";
      role = existingRole;

      const updates: Record<string, unknown> = {};

      // If whitelisted and email verified, elevate immediately to admin
      if (grantAdmin && role !== "admin") {
        role = "admin";
        updates.role = "admin";
        updates.monthlyTokenLimit = 1_000_000;
        updates.updatedAt = Timestamp.now();
      }

      // If existing user has placeholder or missing name, update from Google token
      let currentDisplayName = existing.displayName;
      if (!currentDisplayName || currentDisplayName === "Alex Rivera" || currentDisplayName === "Learner") {
        currentDisplayName = decoded.name || resolvedDisplayName;
        updates.displayName = currentDisplayName;
      }

      // If existing user has no username, generate one
      let currentUsername = existing.username;
      if (!currentUsername) {
        currentUsername = defaultUsernameSeed;
        updates.username = currentUsername;
      }

      if (Object.keys(updates).length > 0) {
        await userRef.update(updates);
      }

      const effectiveTokenLimit =
        role === "admin"
          ? 1_000_000
          : role === "teacher"
          ? (existing.monthlyTokenLimit || env.TEACHER_TOKEN_LIMIT)
          : (existing.monthlyTokenLimit || env.STUDENT_TOKEN_LIMIT);

      userData = {
        uid,
        email: existing.email || email || null,
        displayName: currentDisplayName,
        username: currentUsername,
        photoURL: existing.photoURL || decoded.picture || null,
        role,
        roleRequest: existing.roleRequest || "none",
        xp: existing.xp || 0,
        streakDays: existing.streakDays || 1,
        lastActiveDate: existing.lastActiveDate || null,
        monthlyTokenLimit: effectiveTokenLimit,
        monthlyTokensUsed: existing.monthlyTokensUsed || 0,
        disabled: !!existing.disabled,
      };
    }

    // Always ensure the custom claim matches the Firestore role
    if (decoded.role !== role) {
      await adminAuth().setCustomUserClaims(uid, { role });
    }

    return NextResponse.json({
      ok: true,
      data: {
        user: userData,
        adminPendingVerification: !!adminPendingVerification,
      },
    });
  } catch (err: unknown) {
    console.error("Bootstrap error:", err);
    const message = err instanceof Error ? err.message : "Bootstrap failed";
    
    const isFirestoreDisabled =
      message.includes("Cloud Firestore API has not been used") ||
      message.includes("firestore.googleapis.com") ||
      message.includes("PERMISSION_DENIED");

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: isFirestoreDisabled ? "FIRESTORE_DISABLED" : "INTERNAL",
          message: isFirestoreDisabled
            ? "Cloud Firestore API is not enabled yet in your Firebase project. Please enable it in the Firebase Console: https://console.firebase.google.com/project/synapta-learning/firestore"
            : message,
        },
      },
      { status: isFirestoreDisabled ? 503 : 500 }
    );
  }
}
