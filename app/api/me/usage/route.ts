import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "User profile not found" } },
        { status: 404 }
      );
    }

    const userData = userDoc.data()!;
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const usageDoc = await adminDb().collection("usage").doc(`${caller.uid}_${currentMonthStr}`).get();
    const usageData = usageDoc.exists ? usageDoc.data() : null;

    return NextResponse.json({
      ok: true,
      data: {
        uid: caller.uid,
        role: caller.role,
        monthlyTokensUsed: userData.monthlyTokensUsed || 0,
        monthlyTokenLimit: userData.monthlyTokenLimit || 50000,
        usagePeriod: currentMonthStr,
        callsThisMonth: usageData?.calls || 0,
        estimatedCostUsd: usageData?.estimatedCostUsd || 0,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
