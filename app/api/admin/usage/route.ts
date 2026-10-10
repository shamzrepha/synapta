import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Admin role strictly enforced
    await requireUser(req, ["admin"]);

    // 1. Fetch usage documents
    const usageSnap = await adminDb().collection("usage").get();

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCalls = 0;
    let totalCostUsd = 0;

    const monthlyMap = new Map<
      string,
      { period: string; tokensIn: number; tokensOut: number; calls: number; estimatedCostUsd: number }
    >();

    for (const doc of usageSnap.docs) {
      const data = doc.data();
      const inTokens = typeof data.tokensIn === "number" ? data.tokensIn : 0;
      const outTokens = typeof data.tokensOut === "number" ? data.tokensOut : 0;
      const calls = typeof data.calls === "number" ? data.calls : 0;
      const cost = typeof data.estimatedCostUsd === "number" ? data.estimatedCostUsd : 0;
      const period = data.period || "Current";

      totalTokensIn += inTokens;
      totalTokensOut += outTokens;
      totalCalls += calls;
      totalCostUsd += cost;

      const existingPeriod = monthlyMap.get(period) || {
        period,
        tokensIn: 0,
        tokensOut: 0,
        calls: 0,
        estimatedCostUsd: 0,
      };

      existingPeriod.tokensIn += inTokens;
      existingPeriod.tokensOut += outTokens;
      existingPeriod.calls += calls;
      existingPeriod.estimatedCostUsd += cost;

      monthlyMap.set(period, existingPeriod);
    }

    const monthlyBreakdown = Array.from(monthlyMap.values()).sort((a, b) =>
      b.period.localeCompare(a.period)
    );

    // 2. Fetch platform counts
    const [usersSnap, classesSnap, evidenceSnap] = await Promise.all([
      adminDb().collection("users").get(),
      adminDb().collection("classes").get(),
      adminDb().collection("evidence").limit(500).get(),
    ]);

    let studentCount = 0;
    let teacherCount = 0;
    let adminCount = 0;

    for (const doc of usersSnap.docs) {
      const role = doc.data().role;
      if (role === "admin") adminCount++;
      else if (role === "teacher") teacherCount++;
      else studentCount++;
    }

    return NextResponse.json({
      ok: true,
      data: {
        summary: {
          totalTokens: totalTokensIn + totalTokensOut,
          totalTokensIn,
          totalTokensOut,
          totalCalls,
          totalCostUsd: parseFloat(totalCostUsd.toFixed(4)),
        },
        monthlyBreakdown,
        counts: {
          totalUsers: usersSnap.size,
          students: studentCount,
          teachers: teacherCount,
          admins: adminCount,
          classes: classesSnap.size,
          evidenceLogs: evidenceSnap.size,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
