import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { buildPath, paceWeeks, KcPlanNode } from "@/lib/teacher/planner";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await params;
    const caller = await requireUser(req);
    await assertClassAccess(caller, classId, "view");

    // Fetch KCs
    const kcsSubSnap = await adminDb()
      .collection("classes")
      .doc(classId)
      .collection("kcs")
      .orderBy("order", "asc")
      .get();

    const planNodes: KcPlanNode[] = kcsSubSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        title: d.title || "Topic",
        prerequisiteIds: d.prerequisiteIds || [],
        order: d.order,
        hasLab: !!d.lab && d.lab.type !== "none",
      };
    });

    // Fetch Mastery
    const masterySnap = await adminDb()
      .collection("mastery")
      .where("uid", "==", caller.uid)
      .where("classId", "==", classId)
      .get();

    const masteryMap: Record<string, number> = {};
    masterySnap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.kcId) {
        masteryMap[d.kcId] = typeof d.pL === "number" ? d.pL : 0.20;
      }
    });

    // Fetch Goal
    const profileDoc = await adminDb().collection("learnerProfiles").doc(caller.uid).get();
    const profileData = profileDoc.exists ? profileDoc.data() : {};
    const goals = Array.isArray(profileData?.goals) ? profileData.goals : [];
    const classGoal = goals.find((g: { classId: string }) => g.classId === classId) || null;

    const recommendedPath = buildPath({
      kcs: planNodes,
      masteryMap,
    });

    const pacing = paceWeeks({
      pathLength: recommendedPath.length,
      targetDate: classGoal?.targetDate || null,
      minutesPerDay: classGoal?.minutesPerDay || 30,
    });

    return NextResponse.json({
      ok: true,
      data: {
        recommendedPath: recommendedPath.map((p) => ({
          kcId: p.kc.id,
          title: p.kc.title,
          currentPL: Number((p.currentPL * 100).toFixed(1)),
          isUnlocked: p.isUnlocked,
          activity: p.activity,
        })),
        pacing,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
