import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    // 1. Fetch learnerProfile
    const profileRef = adminDb().collection("learnerProfiles").doc(caller.uid);
    const profileDoc = await profileRef.get();
    const profileData = profileDoc.exists ? profileDoc.data()! : {};

    // 2. Fetch active mastery scores (cap to top 30 most relevant)
    const masterySnap = await adminDb()
      .collection("mastery")
      .where("uid", "==", caller.uid)
      .limit(30)
      .get();

    const perKcPL: Record<string, number> = {};
    const reviewQueue: Array<{ kcId: string; nextReviewAt: string | null; stability: number }> = [];

    masterySnap.docs.forEach((doc) => {
      const data = doc.data();
      const kcId = data.kcId;
      if (kcId) {
        perKcPL[kcId] = typeof data.pL === "number" ? data.pL : 0.20;
        if (data.nextReviewAt) {
          reviewQueue.push({
            kcId,
            nextReviewAt: data.nextReviewAt?.toDate ? data.nextReviewAt.toDate().toISOString() : null,
            stability: data.stability ?? 1.0,
          });
        }
      }
    });

    // 3. Fetch open misconceptions (resolved: false)
    const misSnap = await adminDb()
      .collection("misconceptions")
      .where("uid", "==", caller.uid)
      .where("resolved", "==", false)
      .limit(20)
      .get();

    const openMisconceptions = misSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        kcId: d.kcId,
        classId: d.classId,
        label: d.label,
        description: d.description,
        occurrences: d.occurrences || 1,
        lastSeenAt: d.lastSeenAt?.toDate ? d.lastSeenAt.toDate().toISOString() : null,
      };
    });

    // 4. Compact state payload
    return NextResponse.json({
      ok: true,
      data: {
        uid: caller.uid,
        goals: profileData.goals || [],
        preferredFormats: profileData.preferredFormats || {},
        representationStats: profileData.representationStats || {},
        perKcPL,
        openMisconceptions,
        reviewQueue,
        diagnosticResults: profileData.diagnosticResults || {},
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
