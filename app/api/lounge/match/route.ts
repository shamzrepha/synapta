import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { MASTERY_THRESHOLD } from "@/lib/bkt/engine";
import { z } from "zod";

export const runtime = "nodejs";

const matchInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
});

export interface PeerMatch {
  uid: string;
  displayName: string;
  email: string;
  xp: number;
  streakDays: number;
  pL: number;
  masteryPercentage: number;
  isMastered: boolean;
  matchReason: string;
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = matchInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { classId, kcId } = parsed.data;

    // 1. Fetch class & KC info
    const classDoc = await adminDb().collection("classes").doc(classId).get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const kcDoc = await adminDb()
      .collection("classes")
      .doc(classId)
      .collection("kcs")
      .doc(kcId)
      .get();
    const kcTitle = kcDoc.exists ? kcDoc.data()?.title : "Selected Concept";

    // 2. Fetch all active enrollments for this class
    const enrollmentsSnap = await adminDb()
      .collection("enrollments")
      .where("classId", "==", classId)
      .where("status", "==", "active")
      .get();

    const otherStudentUids = enrollmentsSnap.docs
      .map((d) => d.data().uid)
      .filter((uid) => uid !== caller.uid);

    if (otherStudentUids.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          kcTitle,
          matches: [],
          message: "No other students are currently enrolled in this class to match.",
        },
      });
    }

    // 3. Fetch mastery records for this specific KC
    const masterySnap = await adminDb()
      .collection("mastery")
      .where("classId", "==", classId)
      .where("kcId", "==", kcId)
      .get();

    const masteryMap = new Map<string, number>();
    for (const doc of masterySnap.docs) {
      const data = doc.data();
      if (typeof data.pL === "number") {
        masteryMap.set(data.uid, data.pL);
      }
    }

    // 4. Fetch user profile data
    const userDocs = await Promise.all(
      otherStudentUids.map((uid) => adminDb().collection("users").doc(uid).get())
    );

    const matches: PeerMatch[] = [];

    for (const uDoc of userDocs) {
      if (!uDoc.exists) continue;
      const u = uDoc.data()!;
      const uid = uDoc.id;
      const pL = masteryMap.get(uid) ?? 0.20;
      const isMastered = pL >= MASTERY_THRESHOLD;
      const masteryPercentage = Math.round(pL * 100);

      let matchReason = "Available Study Partner";
      if (pL >= MASTERY_THRESHOLD) {
        matchReason = `Mastered Topic (${masteryPercentage}% P(L)) — High-impact peer mentor`;
      } else if (pL >= 0.70) {
        matchReason = `Competent Concept Mastery (${masteryPercentage}% P(L)) — Ready to explain`;
      } else {
        matchReason = `Collaborative Co-Learner (${masteryPercentage}% P(L)) — Study together`;
      }

      matches.push({
        uid,
        displayName: u.displayName || "Student",
        email: u.email || "",
        xp: u.xp || 0,
        streakDays: u.streakDays || 1,
        pL,
        masteryPercentage,
        isMastered,
        matchReason,
      });
    }

    // 5. Rank matches: highest mastery first (ideal peer explainers)
    matches.sort((a, b) => b.pL - a.pL);

    return NextResponse.json({
      ok: true,
      data: {
        kcTitle,
        matches,
        count: matches.length,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
