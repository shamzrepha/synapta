import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { UserRole } from "@/lib/store/use-user-store";
import { z } from "zod";

export const runtime = "nodejs";

const bootstrapBodySchema = z.object({
  roleRequest: z.enum(["none", "pending"]).optional().default("none"),
  displayName: z.string().optional(),
  photoURL: z.string().nullable().optional(),
});

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

    const bodyJson = await req.json().catch(() => ({}));
    const parsed = bootstrapBodySchema.safeParse(bodyJson);
    const { roleRequest, displayName, photoURL } = parsed.success
      ? parsed.data
      : { roleRequest: "none" as const, displayName: undefined, photoURL: undefined };

    const env = getServerEnv();
    const adminEmails = env.ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isSuperAdminEmail = !!email && adminEmails.includes(email.toLowerCase());

    const userRef = adminDb().collection("users").doc(uid);
    const userDoc = await userRef.get();

    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
    let role: UserRole = isSuperAdminEmail ? "admin" : "student";
    let userData;

    if (!userDoc.exists) {
      // Create fresh user profile
      const defaultTokenLimit = isSuperAdminEmail
        ? 1_000_000
        : env.STUDENT_TOKEN_LIMIT;

      userData = {
        uid,
        email: email || null,
        displayName: displayName || decoded.name || email?.split("@")[0] || "Learner",
        photoURL: photoURL || decoded.picture || null,
        role,
        roleRequest: isSuperAdminEmail ? "none" : roleRequest,
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
      role = (existing.role as UserRole) || "student";

      // If email is in ADMIN_EMAILS, ensure role is elevated to admin
      if (isSuperAdminEmail && role !== "admin") {
        role = "admin";
        await userRef.update({
          role: "admin",
          monthlyTokenLimit: 1_000_000,
          updatedAt: Timestamp.now(),
        });
      }

      userData = {
        uid,
        email: existing.email || email || null,
        displayName: existing.displayName || decoded.name || "Learner",
        photoURL: existing.photoURL || decoded.picture || null,
        role,
        roleRequest: existing.roleRequest || "none",
        xp: existing.xp || 0,
        streakDays: existing.streakDays || 1,
        lastActiveDate: existing.lastActiveDate || null,
        monthlyTokenLimit: existing.monthlyTokenLimit || env.STUDENT_TOKEN_LIMIT,
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
      },
    });
  } catch (err: unknown) {
    console.error("Bootstrap error:", err);
    const message = err instanceof Error ? err.message : "Bootstrap failed";
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 }
    );
  }
}
