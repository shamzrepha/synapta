import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { MASTERY_THRESHOLD } from "@/lib/bkt/engine";

export const runtime = "nodejs";

export interface HeatmapCell {
  kcId: string;
  pL: number;
  attempts: number;
  correct: number;
  status: "novice" | "emerging" | "competent" | "mastered";
  lastUpdated?: string | null;
}

export interface StudentHeatmapRow {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  xp: number;
  streakDays: number;
  averagePL: number;
  masteredCount: number;
  kcs: Record<string, HeatmapCell>;
}

export interface KcSummary {
  id: string;
  title: string;
  order: number;
  pL0: number;
  averagePL: number;
  masteredPercentage: number;
  strugglingPercentage: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    // 1. Fetch Class
    const classDoc = await adminDb().collection("classes").doc(id).get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    if (classData.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Unauthorized to view class heatmap" } },
        { status: 403 }
      );
    }

    // 2. Fetch KCs
    const kcsSubSnap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("kcs")
      .get();

    let rawKcs: { id: string; title: string; order?: number; bkt?: { pL0?: number } }[] = [];

    if (!kcsSubSnap.empty) {
      rawKcs = kcsSubSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as { title: string; order?: number; bkt?: { pL0?: number } }),
      }));
    } else if (Array.isArray(classData.kcs)) {
      rawKcs = classData.kcs;
    }

    rawKcs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // 3. Fetch Enrolled Active Students
    const enrollmentsSnap = await adminDb()
      .collection("enrollments")
      .where("classId", "==", id)
      .where("status", "==", "active")
      .get();

    const studentUids: string[] = [];
    const studentEnrollmentMap = new Map<string, { joinedAt?: string }>();

    for (const doc of enrollmentsSnap.docs) {
      const data = doc.data();
      studentUids.push(data.uid);
      studentEnrollmentMap.set(data.uid, {
        joinedAt: data.joinedAt?.toDate ? data.joinedAt.toDate().toISOString() : undefined,
      });
    }

    // 4. Fetch Users data
    const userDocs = await Promise.all(
      studentUids.map((uid) => adminDb().collection("users").doc(uid).get())
    );

    const usersMap = new Map<
      string,
      { displayName: string; email: string; xp: number; streakDays: number; photoURL?: string }
    >();

    for (const uDoc of userDocs) {
      if (uDoc.exists) {
        const u = uDoc.data()!;
        usersMap.set(uDoc.id, {
          displayName: u.displayName || "Student",
          email: u.email || "No email",
          xp: u.xp || 0,
          streakDays: u.streakDays || 1,
          photoURL: u.photoURL || null,
        });
      }
    }

    // 5. Fetch all Mastery documents for this class
    const masterySnap = await adminDb()
      .collection("mastery")
      .where("classId", "==", id)
      .get();

    const masteryMap = new Map<
      string,
      { pL: number; attempts: number; correct: number; lastUpdated?: string | null }
    >();

    for (const doc of masterySnap.docs) {
      const m = doc.data();
      const key = `${m.uid}_${m.kcId}`;
      masteryMap.set(key, {
        pL: typeof m.pL === "number" ? m.pL : 0.2,
        attempts: typeof m.attempts === "number" ? m.attempts : 0,
        correct: typeof m.correct === "number" ? m.correct : 0,
        lastUpdated: m.lastUpdated?.toDate ? m.lastUpdated.toDate().toISOString() : null,
      });
    }

    // 6. Build Student Rows
    const students: StudentHeatmapRow[] = [];

    for (const uid of studentUids) {
      const profile = usersMap.get(uid) || {
        displayName: "Student",
        email: "unknown",
        xp: 0,
        streakDays: 1,
      };

      const kcsCells: Record<string, HeatmapCell> = {};
      let totalPL = 0;
      let masteredCount = 0;

      for (const kc of rawKcs) {
        const mKey = `${uid}_${kc.id}`;
        const record = masteryMap.get(mKey);
        const pL = record ? record.pL : (kc.bkt?.pL0 ?? 0.2);
        const attempts = record?.attempts ?? 0;
        const correct = record?.correct ?? 0;

        let status: HeatmapCell["status"] = "novice";
        if (pL >= MASTERY_THRESHOLD) status = "mastered";
        else if (pL >= 0.7) status = "competent";
        else if (pL >= 0.4) status = "emerging";

        if (pL >= MASTERY_THRESHOLD) masteredCount++;
        totalPL += pL;

        kcsCells[kc.id] = {
          kcId: kc.id,
          pL,
          attempts,
          correct,
          status,
          lastUpdated: record?.lastUpdated,
        };
      }

      const averagePL = rawKcs.length > 0 ? totalPL / rawKcs.length : 0;

      students.push({
        uid,
        displayName: profile.displayName,
        email: profile.email,
        photoURL: profile.photoURL,
        xp: profile.xp,
        streakDays: profile.streakDays,
        averagePL,
        masteredCount,
        kcs: kcsCells,
      });
    }

    // 7. Calculate KC Summaries
    const kcsSummary: KcSummary[] = rawKcs.map((kc, idx) => {
      let sumPL = 0;
      let masteredStudents = 0;
      let strugglingStudents = 0;

      for (const student of students) {
        const cell = student.kcs[kc.id];
        if (cell) {
          sumPL += cell.pL;
          if (cell.pL >= MASTERY_THRESHOLD) masteredStudents++;
          if (cell.pL < 0.4) strugglingStudents++;
        }
      }

      const count = students.length || 1;
      const averagePL = sumPL / count;

      return {
        id: kc.id,
        title: kc.title,
        order: kc.order ?? idx,
        pL0: kc.bkt?.pL0 ?? 0.2,
        averagePL,
        masteredPercentage: Math.round((masteredStudents / count) * 100),
        strugglingPercentage: Math.round((strugglingStudents / count) * 100),
      };
    });

    // 8. Overall Class Summary
    const totalMastery = students.reduce((acc, s) => acc + s.averagePL, 0);
    const classAverageMastery = students.length > 0 ? totalMastery / students.length : 0;

    const strugglingKcs = [...kcsSummary]
      .sort((a, b) => a.averagePL - b.averagePL)
      .slice(0, 3)
      .filter((k) => k.averagePL < 0.7);

    return NextResponse.json({
      ok: true,
      data: {
        class: {
          id,
          title: classData.title,
          subject: classData.subject || "General",
          description: classData.description || "",
        },
        kcs: kcsSummary,
        students,
        summary: {
          totalStudents: students.length,
          totalKcs: rawKcs.length,
          classAverageMastery,
          strugglingKcs,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

// POST endpoint: Seed demo cohort for testing and instant visualization
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    const classDoc = await adminDb().collection("classes").doc(id).get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    if (classData.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Unauthorized" } },
        { status: 403 }
      );
    }

    // Get KCs
    const kcsSubSnap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("kcs")
      .get();

    let rawKcs = kcsSubSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (rawKcs.length === 0 && Array.isArray(classData.kcs)) {
      rawKcs = classData.kcs;
    }

    if (rawKcs.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_KCS", message: "Please generate a syllabus with Knowledge Components first." } },
        { status: 400 }
      );
    }

    // Demo student cohort profiles
    const demoStudents = [
      { id: `demo_alex_${id}`, name: "Alex Chen", email: "alex.chen@student.synapta.edu", xp: 480, streak: 6, bias: 0.96 },
      { id: `demo_maya_${id}`, name: "Maya Patel", email: "maya.patel@student.synapta.edu", xp: 390, streak: 4, bias: 0.88 },
      { id: `demo_liam_${id}`, name: "Liam Smith", email: "liam.smith@student.synapta.edu", xp: 210, streak: 2, bias: 0.55 },
      { id: `demo_zoe_${id}`, name: "Zoe Martinez", email: "zoe.m@student.synapta.edu", xp: 520, streak: 8, bias: 0.98 },
      { id: `demo_noah_${id}`, name: "Noah Kim", email: "noah.kim@student.synapta.edu", xp: 140, streak: 1, bias: 0.32 },
      { id: `demo_chloe_${id}`, name: "Chloe Taylor", email: "chloe.t@student.synapta.edu", xp: 290, streak: 3, bias: 0.72 },
    ];

    const batch = adminDb().batch();

    for (const s of demoStudents) {
      // 1. User doc
      const userRef = adminDb().collection("users").doc(s.id);
      batch.set(
        userRef,
        {
          uid: s.id,
          displayName: s.name,
          email: s.email,
          role: "student",
          xp: s.xp,
          streakDays: s.streak,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      // 2. Enrollment doc
      const enrollRef = adminDb().collection("enrollments").doc(`${s.id}_${id}`);
      batch.set(
        enrollRef,
        {
          uid: s.id,
          classId: id,
          status: "active",
          role: "student",
          joinedAt: Timestamp.now(),
        },
        { merge: true }
      );

      // 3. Mastery docs for each KC
      rawKcs.forEach((kc, kcIndex) => {
        // Vary mastery slightly per topic
        const variation = ((kcIndex % 3) - 1) * 0.15;
        const pL = Math.max(0.15, Math.min(0.99, s.bias + variation));
        const attempts = Math.floor(Math.random() * 8) + 3;
        const correct = Math.floor(attempts * pL);

        const masteryRef = adminDb().collection("mastery").doc(`${s.id}_${kc.id}`);
        batch.set(
          masteryRef,
          {
            uid: s.id,
            classId: id,
            kcId: kc.id,
            pL: parseFloat(pL.toFixed(3)),
            attempts,
            correct,
            lastUpdated: Timestamp.now(),
          },
          { merge: true }
        );
      });
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      data: {
        message: "Successfully seeded sample student cohort with mastery data",
        count: demoStudents.length,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
