import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { UserRole } from "@/lib/store/use-user-store";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const bootstrapBodySchema = z.object({
  roleRequest: z.enum(["none", "pending"]).optional().default("none"),
  displayName: z.string().optional(),
  username: z.string().optional(),
  photoURL: z.string().nullable().optional(),
});

/** A handle nobody else uses: mentions and /u/<handle> resolve to exactly one person. */
async function uniqueUsername(seed: string, uid: string): Promise<string> {
  const col = adminDb().collection("users");
  let candidate = seed;
  for (let i = 0; i < 6; i++) {
    const clash = await col.where("username", "==", candidate).limit(2).get();
    if (clash.docs.every((d) => d.id === uid)) return candidate;
    candidate = `${seed.slice(0, 20)}${i === 0 ? uid.slice(0, 4).toLowerCase().replace(/[^a-z0-9]/g, "x") : Math.floor(1000 + Math.random() * 9000)}`;
  }
  return `${seed.slice(0, 16)}_${uid.slice(0, 6).toLowerCase()}`;
}

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
    const rateLimitRes = await checkRateLimit(req, {
      keyPrefix: "bootstrap",
      limit: 30,
      windowMs: 60_000,
    });
    if (rateLimitRes) return rateLimitRes;

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
      !!normalizedEmail && adminEmails.includes(normalizedEmail);

    // Unconditionally grant admin role to whitelisted owner emails only if email is verified
    const grantAdmin = isWhitelistedAdminEmail && isEmailVerified;
    const adminPendingVerification = isWhitelistedAdminEmail && !isEmailVerified;

    const userRef = adminDb().collection("users").doc(uid);
    const userDoc = await userRef.get();

    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
    let role: UserRole = grantAdmin ? "admin" : "student";
    let userData;

    // Determine clean display name and username from Google Auth / email
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
    // handles must be 3+ characters to be mentionable, and unique
    const paddedSeed = defaultUsernameSeed.length >= 3 ? defaultUsernameSeed : `${defaultUsernameSeed}_${uid.slice(0, 4).toLowerCase()}`;
    const handle = await uniqueUsername(paddedSeed, uid);

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
        username: handle,
        displayNameLower: String(resolvedDisplayName).toLowerCase(),
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

      // If whitelisted, elevate immediately to admin
      if (grantAdmin && role !== "admin") {
        role = "admin";
        updates.role = "admin";
        updates.monthlyTokenLimit = 1_000_000;
        updates.updatedAt = Timestamp.now();
      }

      // If existing user has placeholder or outdated name, sync from Google token
      let currentDisplayName = existing.displayName;
      if (
        !currentDisplayName ||
        currentDisplayName.toLowerCase().includes("alex rivera") ||
        currentDisplayName === "Learner" ||
        (decoded.name && currentDisplayName !== decoded.name)
      ) {
        currentDisplayName = decoded.name || resolvedDisplayName;
        updates.displayName = currentDisplayName;
      }

      // If existing user has no username or legacy placeholder handle, update
      let currentUsername = existing.username;
      if (!currentUsername || currentUsername.includes("alex") || currentUsername.includes("rivera")) {
        currentUsername = handle;
        updates.username = currentUsername;
      } else {
        // older accounts: lower-case, 3+ characters and unique, so @mentions find exactly one person
        const clean = sanitizeUsername(currentUsername);
        if (clean !== currentUsername || clean.length < 3) {
          currentUsername = await uniqueUsername(clean.length >= 3 ? clean : paddedSeed, uid);
          updates.username = currentUsername;
        } else {
          const clash = await adminDb().collection("users").where("username", "==", currentUsername).limit(2).get();
          if (clash.docs.some((d) => d.id !== uid)) {
            currentUsername = await uniqueUsername(currentUsername, uid);
            updates.username = currentUsername;
          }
        }
      }
      if (existing.displayNameLower !== String(currentDisplayName || "").toLowerCase()) updates.displayNameLower = String(currentDisplayName || "").toLowerCase();

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
            ? `Cloud Firestore API is not enabled yet in your Firebase project. Please enable it in the Firebase Console: https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID || "synapta-learning"}/firestore`
            : message,
        },
      },
      { status: isFirestoreDisabled ? 503 : 500 }
    );
  }
}
