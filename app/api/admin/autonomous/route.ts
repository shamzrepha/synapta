import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { DEFAULT_PEER_MEDIAN_MS, type LearningCohortId } from "@/lib/learning/telemetry";

export const runtime = "nodejs";

const seedSchema = z.object({
  institution: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(120),
  level: z.string().trim().min(2).max(40).default("200L"),
});

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);

    const [usersSnap, classesSnap, inquiriesSnap] = await Promise.all([
      adminDb().collection("users").limit(400).get(),
      adminDb().collection("classes").limit(200).get(),
      adminDb()
        .collection("institutionInquiries")
        .orderBy("createdAt", "desc")
        .limit(8)
        .get()
        .catch(() => null),
    ]);

    const campusCounts = new Map<string, number>();
    const deptDemand = new Map<string, { institution: string; department: string; level: string; students: number }>();
    const cohortCounts: Record<LearningCohortId, number> = {
      step_by_step_procedural: 0,
      visual_intuitive: 0,
      example_driven: 0,
      first_principles: 0,
    };

    let paidSubscribers = 0;

    for (const d of usersSnap.docs) {
      const u = d.data() || {};
      const inst = typeof u.institution === "string" && u.institution.trim() ? u.institution.trim() : null;
      const dept = typeof u.department === "string" && u.department.trim() ? u.department.trim() : null;
      const lvl = typeof u.level === "string" && u.level.trim() ? u.level.trim() : "100L";

      if (inst) {
        campusCounts.set(inst, (campusCounts.get(inst) || 0) + 1);
      }
      if (inst && dept) {
        const key = `${inst.toLowerCase()}::${dept.toLowerCase()}`;
        const cur = deptDemand.get(key) || { institution: inst, department: dept, level: lvl, students: 0 };
        cur.students += 1;
        deptDemand.set(key, cur);
      }

      const cohort = (u.telemetryProfile?.dominantCohort || "step_by_step_procedural") as LearningCohortId;
      if (cohort in cohortCounts) {
        cohortCounts[cohort] += 1;
      }

      if (u.plan && u.plan !== "free") {
        paidSubscribers += 1;
      }
    }

    const servedDepts = new Set<string>();
    for (const c of classesSnap.docs) {
      const cd = c.data() || {};
      if (cd.institution && cd.department) {
        servedDepts.add(`${String(cd.institution).toLowerCase()}::${String(cd.department).toLowerCase()}`);
      }
    }

    const unservedDepartments = Array.from(deptDemand.entries())
      .filter(([key]) => !servedDepts.has(key))
      .map(([, val]) => val)
      .sort((a, b) => b.students - a.students)
      .slice(0, 4);

    const topCampuses = Array.from(campusCounts.entries())
      .map(([institution, students]) => ({ institution, students }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 5);

    const institutionalLeads = (inquiriesSnap?.docs || []).map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        institution: String(d.institution || ""),
        department: String(d.department || ""),
        contactRole: String(d.contactRole || "hod_dean"),
        estimatedStudents: Number(d.estimatedStudents || 100),
        estimatedSemesterNgn: Number(d.estimatedSemesterNgn || 120_000),
        contactName: String(d.contactName || ""),
        contactEmail: String(d.contactEmail || ""),
        contactPhone: String(d.contactPhone || ""),
        status: String(d.status || "new"),
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        topCampuses,
        unservedDepartments,
        institutionalLeads,
        cohortCounts,
        paidSubscribers,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "admin_autonomous", limit: 5, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const body = await parseJson(req, seedSchema);

    // one seeded pack per campus, department and level: a double click must not publish (and notify) twice
    const already = await adminDb()
      .collection("classes")
      .where("autoSeeded", "==", true)
      .where("institution", "==", body.institution)
      .where("department", "==", body.department)
      .where("level", "==", body.level)
      .limit(1)
      .get();
    if (!already.empty) {
      throw new ApiError(409, "ALREADY_SEEDED", "A starter pack for this campus, department and level already exists.");
    }

    const joinCode = `${body.department.slice(0, 3).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
    const classRef = adminDb().collection("classes").doc();

    const classTitle = `${body.department} (${body.level}) — NUC Core & Past Questions`;
    const classDoc = {
      id: classRef.id,
      title: classTitle,
      name: classTitle,
      subject: body.department,
      description: `Autonomous NUC-aligned curriculum pack and past examination bank for ${body.level} ${body.department} at ${body.institution}.`,
      institution: body.institution,
      department: body.department,
      level: body.level,
      teacherId: caller.uid,
      ownerId: caller.uid,
      teacherName: "Sprout Autonomous Curriculum",
      autoSeeded: true,
      visibility: "public",
      status: "published",
      joinCode,
      studentCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const starterQuestions = [
      {
        year: "2023/2024 Exam",
        questionNumber: "1(a)",
        topic: `${body.department} Fundamental Principles`,
        questionType: "theory",
        marks: 15,
        questionText: `State the fundamental conservation and equilibrium laws governing ${body.department} systems at ${body.level}, and derive the primary governing equation from first principles.`,
        options: [
          "Conservation law holds across closed control volumes with boundary conditions",
          "System state is independent of initial boundary constraints",
          "Equilibrium occurs only at zero potential energy",
          "Linear approximation holds for all non-linear regimes",
        ],
        correctIndex: 0,
        explanation:
          "First-principles derivations in university exams require stating assumptions, control volume/domain boundaries, and standard SI units.",
      },
      {
        year: "2023/2024 Exam",
        questionNumber: "1(b)",
        topic: `Applied ${body.department} Problem Solving`,
        questionType: "calculation",
        marks: 15,
        questionText: `A standard ${body.department} benchmark system operates at 80% efficiency under a primary load of 120 units. Calculate the net output and percentage loss, showing every intermediate step.`,
        options: [
          "Net output = 96 units; Loss = 24 units (20%)",
          "Net output = 100 units; Loss = 20 units (16.7%)",
          "Net output = 144 units; Loss = 24 units (20%)",
          "Net output = 80 units; Loss = 40 units (33.3%)",
        ],
        correctIndex: 0,
        explanation: "Net output = 0.80 * 120 = 96 units; Loss = 120 - 96 = 24 units (20%).",
      },
      {
        year: "2022/2023 Exam",
        questionNumber: "Obj 1",
        topic: `${body.department} Core Methodology`,
        questionType: "objective",
        marks: 5,
        questionText: `Which of the following best characterizes an optimal design verification check in ${body.department}?`,
        options: [
          "Dimensional homogeneity, boundary condition verification, and limiting-case analysis",
          "Relying solely on empirical guesswork without unit verification",
          "Ignoring transient states in dynamic operations",
          "Omitting tolerance bounds during component selection",
        ],
        correctIndex: 0,
        explanation:
          "Checking dimensional consistency and limiting behavior catches algebraic errors immediately during an exam.",
      },
    ];

    const batch = adminDb().batch();
    batch.set(classRef, classDoc);

    for (const sq of starterQuestions) {
      const qRef = classRef.collection("pastQuestions").doc();
      batch.set(qRef, {
        id: qRef.id,
        questionId: qRef.id,
        ...sq,
        peerMedianMs: DEFAULT_PEER_MEDIAN_MS,
        dwellSampleCount: 1,
        uploadedBy: caller.uid,
        createdAt: Timestamp.now(),
      });
    }

    // Notify matching students in that campus/department
    const matchedStudents = await adminDb()
      .collection("users")
      .where("department", "==", body.department)
      .limit(100)
      .get()
      .catch(() => null);

    let notifiedCount = 0;
    if (matchedStudents) {
      const wantInst = body.institution.toLowerCase();
      const wantAcronym = wantInst.match(/\(([^)]+)\)/)?.[1] ?? "";
      for (const sDoc of matchedStudents.docs) {
        // the department alone is not enough: the pack is for one campus
        const inst = String(sDoc.data()?.institution || "").toLowerCase();
        const sameCampus = inst.length >= 3 && (inst.includes(wantInst) || wantInst.includes(inst) || (wantAcronym !== "" && inst.includes(wantAcronym)));
        if (!sameCampus) continue;
        const nRef = sDoc.ref.collection("notifications").doc();
        batch.set(nRef, {
          type: "course_seeded",
          title: `New ${body.department} Course & Past Questions Ready!`,
          body: `Sprout just launched ${classTitle} for ${body.institution}. Practice CBT & Past Questions now.`,
          href: `/classes/${classRef.id}/past-questions`,
          icon: "book",
          sproutMood: "jump",
          read: false,
          createdAt: Timestamp.now(),
        });
        notifiedCount++;
      }
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      data: {
        classId: classRef.id,
        title: classTitle,
        notifiedCount,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
