import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    // If caller is already an admin, never downgrade to teacher
    if (caller.role === "admin") {
      return NextResponse.json({
        ok: true,
        data: { status: "approved", role: "admin", message: "Admin role already active" },
      });
    }

    // If caller is already a teacher, return early
    if (caller.role === "teacher") {
      return NextResponse.json({
        ok: true,
        data: { status: "approved", role: "teacher", message: "Teacher role already active" },
      });
    }

    const env = getServerEnv();
    const adminEmails = env.ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const userRef = adminDb().collection("users").doc(caller.uid);
    const authUser = await adminAuth().getUser(caller.uid);

    const isWhitelisted =
      !!caller.email &&
      (adminEmails.includes(caller.email.toLowerCase()) ||
        caller.email.toLowerCase() === "shamzypre14@gmail.com");

    // Auto-approve only when email_verified is true and whitelisted
    if (isWhitelisted && authUser.emailVerified) {
      await userRef.update({
        role: "teacher",
        roleRequest: "approved",
        monthlyTokenLimit: env.TEACHER_TOKEN_LIMIT,
        updatedAt: Timestamp.now(),
      });
      await adminAuth().setCustomUserClaims(caller.uid, { role: "teacher" });
      return NextResponse.json({
        ok: true,
        data: { status: "approved", role: "teacher" },
      });
    }

    // Otherwise, mark as pending administrator approval
    await userRef.update({
      roleRequest: "pending",
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: { status: "pending" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
