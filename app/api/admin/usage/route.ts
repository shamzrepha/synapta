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

    // 2. Fetch platform counts & North-Star KPI metrics
    const [usersSnap, classesSnap, evidenceSnap, designsSnap, cacheSnap] = await Promise.all([
      adminDb().collection("users").get(),
      adminDb().collection("classes").get(),
      adminDb().collection("evidence").limit(500).get(),
      adminDb().collection("designs").limit(500).get(),
      adminDb().collection("aiCache").limit(500).get(),
    ]);

    let studentCount = 0;
    let teacherCount = 0;
    let adminCount = 0;
    let retainedUsers7d = 0;
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const doc of usersSnap.docs) {
      const u = doc.data();
      const role = u.role;
      if (role === "admin") adminCount++;
      else if (role === "teacher") teacherCount++;
      else studentCount++;

      const lastActive = u.lastActiveDate || u.updatedAt || u.createdAt;
      const lastActiveMs = typeof lastActive === "string" ? Date.parse(lastActive) : (lastActive?.toMillis?.() ?? 0);
      if (lastActiveMs >= sevenDaysAgoMs || (typeof u.streakDays === "number" && u.streakDays > 0)) {
        retainedUsers7d++;
      }
    }

    const activeLearnersWithEvidence = new Set<string>();
    let verifiedMasteryEvents = 0;
    for (const doc of evidenceSnap.docs) {
      const ev = doc.data();
      if (typeof ev.uid === "string" && ev.uid) activeLearnersWithEvidence.add(ev.uid);
      if (ev.correct === true || (typeof ev.pLAfter === "number" && ev.pLAfter >= 0.8)) {
        verifiedMasteryEvents++;
      }
    }

    let completedLabs = 0;
    for (const doc of designsSnap.docs) {
      const d = doc.data();
      if ((typeof d.commitCount === "number" && d.commitCount > 1) || d.verified === true) {
        completedLabs++;
      }
    }

    const totalUsers = usersSnap.size;
    const activeLearnerCount = Math.max(1, activeLearnersWithEvidence.size || studentCount || 1);
    const costPerLearnerUsd = parseFloat((totalCostUsd / activeLearnerCount).toFixed(4));
    const retentionRatePct = totalUsers > 0 ? Math.round((retainedUsers7d / totalUsers) * 100) : 0;
    const labCompletionRatePct = designsSnap.size > 0 ? Math.round((completedLabs / designsSnap.size) * 100) : 0;

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
        northStar: {
          weeklyVerifiedLearners: activeLearnersWithEvidence.size,
          verifiedMasteryEvents,
          retentionRatePct,
          retainedUsers7d,
          totalDesigns: designsSnap.size,
          completedLabs,
          labCompletionRatePct,
          costPerLearnerUsd,
          cachedPromptsCount: cacheSnap.size,
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
