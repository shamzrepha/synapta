import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const env = getServerEnv();

    const adminEmails = env.ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isWhitelisted = !!caller.email && adminEmails.includes(caller.email.toLowerCase());

    const userRef = adminDb().collection("users").doc(caller.uid);

    if (isWhitelisted) {
      // Auto-approve teacher/admin
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
