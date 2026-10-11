import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    // 1. Fetch live user profile
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const userData = userDoc.exists ? userDoc.data()! : {};

    const profile = {
      uid: caller.uid,
      email: caller.email,
      displayName: userData.displayName || caller.email?.split("@")[0] || "Learner",
      username: userData.username || `user_${caller.uid.slice(0, 6)}`,
      photoURL: userData.photoURL || null,
      role: caller.role,
      xp: userData.xp || 0,
      streakDays: userData.streakDays || 1,
      lastActiveDate: userData.lastActiveDate || null,
      monthlyTokenLimit: userData.monthlyTokenLimit || 50000,
      monthlyTokensUsed: userData.monthlyTokensUsed || 0,
    };

    // 2. Fetch enrolled classes
    const enrollmentsSnap = await adminDb()
      .collection("enrollments")
      .where("uid", "==", caller.uid)
      .where("status", "==", "active")
      .get();

    const classIds = enrollmentsSnap.docs.map((d) => d.data().classId).filter(Boolean);

    // If teacher, also include classes they created
    if (caller.role === "teacher" || caller.role === "admin") {
      const ownedClassesSnap = await adminDb()
        .collection("classes")
        .where("teacherId", "==", caller.uid)
        .limit(20)
        .get();

      for (const doc of ownedClassesSnap.docs) {
        if (!classIds.includes(doc.id)) {
          classIds.push(doc.id);
        }
      }
    }

    const classes: Array<{
      id: string;
      title: string;
      subject: string;
      description: string;
      studentCount: number;
      isOwner: boolean;
    }> = [];

    const kcsMap = new Map<string, { id: string; title: string; classId: string }>();

    for (const cid of classIds.slice(0, 20)) {
      const cDoc = await adminDb().collection("classes").doc(cid).get();
      if (cDoc.exists) {
        const cData = cDoc.data()!;
        classes.push({
          id: cDoc.id,
          title: cData.title || "Untitled Course",
          subject: cData.subject || "General",
          description: cData.description || "",
          studentCount: cData.studentCount || 0,
          isOwner: cData.teacherId === caller.uid,
        });

        // Also index knowledge components for this class
        const kcsSubSnap = await adminDb()
          .collection("classes")
          .doc(cid)
          .collection("kcs")
          .get();

        if (!kcsSubSnap.empty) {
          kcsSubSnap.docs.forEach((kDoc) => {
            const kd = kDoc.data();
            kcsMap.set(kDoc.id, {
              id: kDoc.id,
              title: kd.title || "Topic",
              classId: cid,
            });
          });
        } else if (Array.isArray(cData.kcs)) {
          cData.kcs.forEach((kc: { id: string; title: string }) => {
            if (kc.id) {
              kcsMap.set(kc.id, {
                id: kc.id,
                title: kc.title || "Topic",
                classId: cid,
              });
            }
          });
        }
      }
    }

    // 3. Fetch user's real mastery scores
    const masterySnap = await adminDb()
      .collection("mastery")
      .where("uid", "==", caller.uid)
      .get();

    interface RadarDataPoint {
      subject: string;
      fullName: string;
      pL: number;
      threshold: number;
    }

    const radarData: RadarDataPoint[] = [];
    let masteredCount = 0;
    let learningCount = 0;
    let strugglingCount = 0;
    let totalPL = 0;

    masterySnap.docs.forEach((doc) => {
      const m = doc.data();
      const rawPL = typeof m.pL === "number" ? m.pL : 0.2;
      const percentPL = Math.round(rawPL * 100);
      const kc = kcsMap.get(m.kcId);
      const fullName = kc?.title || m.kcTitle || m.kcId || "Knowledge Component";
      const subject = fullName.length > 18 ? `${fullName.slice(0, 15)}...` : fullName;

      radarData.push({
        subject,
        fullName,
        pL: percentPL,
        threshold: 95,
      });

      totalPL += percentPL;
      if (percentPL >= 95) masteredCount++;
      else if (percentPL >= 40) learningCount++;
      else strugglingCount++;
    });

    const averagePL = radarData.length > 0 ? Math.round(totalPL / radarData.length) : 0;

    // 4. Fetch recent evidence activity (last 5)
    const evidenceSnap = await adminDb()
      .collection("evidence")
      .where("uid", "==", caller.uid)
      .orderBy("timestamp", "desc")
      .limit(5)
      .get()
      .catch(() => null);

    const recentActivity = (evidenceSnap?.docs || []).map((doc) => {
      const e = doc.data();
      return {
        id: doc.id,
        type: e.type,
        kcId: e.kcId,
        score: e.score,
        xpAwarded: e.xpAwarded || 0,
        timestamp: e.timestamp?.toDate ? e.timestamp.toDate().toISOString() : null,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        profile,
        classes,
        radarData: radarData.slice(0, 8),
        masterySummary: {
          masteredCount,
          learningCount,
          strugglingCount,
          averagePL,
          totalTrackedKcs: radarData.length,
        },
        recentActivity,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
