import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { TERM_DAYS } from "@/lib/billing/plans";
import { LEARNING_COHORTS, type LearningCohortId } from "@/lib/learning/telemetry";

export const runtime = "nodejs";

const SCHOOL_KINDS = ["primary", "secondary", "university", "polytechnic", "college", "academy"] as const;

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_school"),
    name: z.string().trim().min(3).max(140),
    kind: z.enum(SCHOOL_KINDS).default("university"),
    department: z.string().trim().max(120).optional().default(""),
    seatLimit: z.number().int().min(10).max(10_000).optional().default(50),
  }),
  z.object({
    action: z.literal("public_register_school"),
    name: z.string().trim().min(3).max(140),
    kind: z.enum(SCHOOL_KINDS).default("secondary"),
    department: z.string().trim().max(120).optional().default(""),
    contactName: z.string().trim().min(2).max(100),
    contactEmail: z.string().trim().email().max(140),
    contactPhone: z.string().trim().max(40).optional().default(""),
    seatLimit: z.number().int().min(10).max(10_000).optional().default(100),
  }),
  z.object({
    action: z.literal("register_members"),
    schoolId: z.string().trim().min(2).max(120),
    role: z.enum(["student", "teacher"]).default("student"),
    identifiers: z.array(z.string().trim().min(2).max(140)).min(1).max(100),
    defaultLevel: z.string().trim().max(40).optional(),
    defaultDepartment: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal("join_by_code"),
    inviteCode: z.string().trim().min(4).max(32),
  }),
  z.object({
    action: z.literal("admin_grant_seats"),
    schoolId: z.string().trim().min(2).max(120),
    seatLimit: z.number().int().min(10).max(50_000),
    days: z.number().int().min(7).max(365).default(TERM_DAYS),
  }),
  z.object({
    action: z.literal("school_announce"),
    schoolId: z.string().trim().min(2).max(120),
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().min(2).max(500),
  }),
]);

function makeSchoolCode(name: string): string {
  const prefix = name
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(3, "X");
  const num = Math.floor(1000 + Math.random() * 9000);
  return `SCH-${prefix}-${num}`;
}

export interface SchoolStudentRow {
  uid: string;
  displayName: string;
  username: string | null;
  email: string | null;
  role: string;
  level: string;
  department: string;
  xp: number;
  streakDays: number;
  predictedReadiness: number;
  weeklyGain: number;
  dominantCohort: LearningCohortId;
  cohortLabel: string;
  weakTopics: string[];
  totalQuestionsAttempted: number;
  totalStudyMinutes: number;
  atRisk: boolean;
}

export interface InterUniStanding {
  rank: number;
  institution: string;
  studentCount: number;
  totalXp: number;
  avgXp: number;
  avgReadiness: number;
  topScholarName: string;
  topScholarXp: number;
}

/**
 * GET /api/schools
 * Returns:
 * 1. The caller's active School Account (Principal, Teacher, or Student view) + full cross-class student progress roster.
 * 2. Pan-African Inter-University & Inter-School Championship Standings.
 * 3. All registered B2B schools (when caller is platform admin).
 */
export async function GET(req: NextRequest) {
  try {
    const db = adminDb();
    const mode = req.nextUrl.searchParams.get("mode") || "";

    // Lightweight directory lookup for onboarding / landing page / school selectors (only real registered schools)
    if (mode === "directory") {
      const schoolsSnap = await db.collection("schools").orderBy("createdAt", "desc").limit(100).get();
      const registeredSchools = schoolsSnap.docs.map((d) => {
        const sd = d.data() || {};
        return {
          id: d.id,
          name: String(sd.name || ""),
          kind: String(sd.kind || "university"),
          department: String(sd.department || ""),
        };
      }).filter((s) => s.name.length > 0);
      return NextResponse.json({ ok: true, data: { registeredSchools } });
    }

    const caller = await requireUser(req);

    const [callerDoc, schoolsSnap, usersSnap] = await Promise.all([
      db.collection("users").doc(caller.uid).get(),
      db.collection("schools").orderBy("createdAt", "desc").limit(50).get(),
      db.collection("users").limit(600).get(),
    ]);

    const callerData = callerDoc.data() || {};
    const requestedSchoolId = req.nextUrl.searchParams.get("schoolId") || "";

    // Find caller's school: explicit query (if admin/principal/teacher), or callerData.schoolId, or principalUid/teacherUids match
    let activeSchoolDoc = schoolsSnap.docs.find((d) => {
      const sd = d.data();
      if (requestedSchoolId && d.id === requestedSchoolId) {
        return (
          caller.role === "admin" ||
          sd.principalUid === caller.uid ||
          (Array.isArray(sd.teacherUids) && sd.teacherUids.includes(caller.uid)) ||
          callerData.schoolId === d.id
        );
      }
      return false;
    });

    if (!activeSchoolDoc) {
      activeSchoolDoc = schoolsSnap.docs.find((d) => {
        const sd = d.data();
        return (
          sd.principalUid === caller.uid ||
          (Array.isArray(sd.teacherUids) && sd.teacherUids.includes(caller.uid)) ||
          callerData.schoolId === d.id
        );
      });
    }

    // Build Inter-University & Inter-School Championship Standings from all users with an institution
    const campusMap = new Map<
      string,
      {
        institution: string;
        studentCount: number;
        totalXp: number;
        readinessSum: number;
        topScholarName: string;
        topScholarXp: number;
      }
    >();

    for (const uDoc of usersSnap.docs) {
      const u = uDoc.data() || {};
      const inst = typeof u.institution === "string" ? u.institution.trim() : "";
      if (!inst) continue;
      const xp = typeof u.xp === "number" ? u.xp : 0;
      const readiness =
        typeof u.telemetryProfile?.predictedExamReadiness === "number"
          ? u.telemetryProfile.predictedExamReadiness
          : 68;
      const name = u.displayName || u.username || "Scholar";

      const key = inst.toLowerCase();
      const cur = campusMap.get(key) || {
        institution: inst,
        studentCount: 0,
        totalXp: 0,
        readinessSum: 0,
        topScholarName: name,
        topScholarXp: -1,
      };
      cur.studentCount += 1;
      cur.totalXp += xp;
      cur.readinessSum += readiness;
      if (xp > cur.topScholarXp) {
        cur.topScholarXp = xp;
        cur.topScholarName = name;
      }
      campusMap.set(key, cur);
    }

    const interUniStandings: InterUniStanding[] = Array.from(campusMap.values())
      .sort((a, b) => b.totalXp - a.totalXp || b.studentCount - a.studentCount)
      .slice(0, 20)
      .map((item, idx) => ({
        rank: idx + 1,
        institution: item.institution,
        studentCount: item.studentCount,
        totalXp: item.totalXp,
        avgXp: Math.round(item.totalXp / Math.max(1, item.studentCount)),
        avgReadiness: Math.round(item.readinessSum / Math.max(1, item.studentCount)),
        topScholarName: item.topScholarName,
        topScholarXp: Math.max(0, item.topScholarXp),
      }));

    let mySchool: Record<string, unknown> | null = null;
    if (activeSchoolDoc) {
      const sd = activeSchoolDoc.data();
      const isManager =
        caller.role === "admin" ||
        sd.principalUid === caller.uid ||
        (Array.isArray(sd.teacherUids) && sd.teacherUids.includes(caller.uid));

      // Gather all students & teachers in this school
      const schoolNameLower = String(sd.name || "").toLowerCase();
      const schoolMembers = usersSnap.docs.filter((uDoc) => {
        const u = uDoc.data() || {};
        if (u.schoolId === activeSchoolDoc.id) return true;
        if (schoolNameLower && String(u.institution || "").toLowerCase() === schoolNameLower) return true;
        return false;
      });

      const students: SchoolStudentRow[] = [];
      for (const mDoc of schoolMembers) {
        const u = mDoc.data() || {};
        const tp = u.telemetryProfile || {};
        const cohortId = (tp.dominantCohort || "step_by_step_procedural") as LearningCohortId;
        const readiness = typeof tp.predictedExamReadiness === "number" ? tp.predictedExamReadiness : 65;
        const studyMs = typeof tp.totalStudyTimeMs === "number" ? tp.totalStudyTimeMs : 0;

        students.push({
          uid: mDoc.id,
          displayName: u.displayName || u.username || "Student",
          username: u.username || null,
          email: isManager ? u.email || null : null,
          role: u.role || "student",
          level: u.level || "100L",
          department: u.department || sd.department || "General",
          xp: typeof u.xp === "number" ? u.xp : 0,
          streakDays: typeof u.streakDays === "number" ? u.streakDays : 0,
          predictedReadiness: readiness,
          weeklyGain: typeof tp.predictedWeeklyGain === "number" ? tp.predictedWeeklyGain : 6,
          dominantCohort: cohortId,
          cohortLabel: LEARNING_COHORTS[cohortId]?.shortLabel || "Micro-Step Formula",
          weakTopics: Array.isArray(tp.weakTopics) ? tp.weakTopics.slice(0, 3) : [],
          totalQuestionsAttempted: typeof tp.totalQuestionsAttempted === "number" ? tp.totalQuestionsAttempted : 0,
          totalStudyMinutes: Math.round(studyMs / 60_000),
          atRisk: readiness < 55,
        });
      }

      students.sort((a, b) => b.xp - a.xp);

      const seatExpiresMs =
        sd.seatExpiresAt?.toMillis?.() || (typeof sd.seatExpiresAt === "number" ? sd.seatExpiresAt : 0);

      mySchool = {
        id: activeSchoolDoc.id,
        name: sd.name,
        kind: sd.kind || "university",
        department: sd.department || "",
        principalUid: sd.principalUid,
        principalName: sd.principalName || "Principal",
        inviteCode: isManager ? sd.inviteCode : undefined,
        seatLimit: sd.seatLimit || 50,
        enrolledCount: students.filter((s) => s.role === "student").length,
        teacherCount: students.filter((s) => s.role === "teacher" || s.role === "admin").length,
        seatExpiresAt: seatExpiresMs ? new Date(seatExpiresMs).toISOString() : null,
        isActiveLicense: seatExpiresMs > Date.now(),
        isManager,
        avgReadiness:
          students.length > 0
            ? Math.round(students.reduce((acc, s) => acc + s.predictedReadiness, 0) / students.length)
            : 68,
        atRiskCount: students.filter((s) => s.role === "student" && s.atRisk).length,
        totalStudyMinutes: students.reduce((acc, s) => acc + s.totalStudyMinutes, 0),
        roster: students,
      };
    }

    const allSchools =
      caller.role === "admin"
        ? schoolsSnap.docs.map((d) => {
            const sd = d.data();
            const expMs = sd.seatExpiresAt?.toMillis?.() || 0;
            return {
              id: d.id,
              name: sd.name,
              kind: sd.kind || "university",
              department: sd.department || "",
              inviteCode: sd.inviteCode,
              seatLimit: sd.seatLimit || 50,
              studentCount: sd.studentCount || 0,
              seatExpiresAt: expMs ? new Date(expMs).toISOString() : null,
              isActiveLicense: expMs > Date.now(),
            };
          })
        : [];

    const registeredSchools = schoolsSnap.docs
      .map((d) => {
        const sd = d.data() || {};
        return {
          id: d.id,
          name: String(sd.name || ""),
          kind: String(sd.kind || "university"),
          department: String(sd.department || ""),
        };
      })
      .filter((s) => s.name.length > 0);

    return NextResponse.json({
      ok: true,
      data: {
        mySchool,
        interUniStandings,
        allSchools,
        registeredSchools,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, postSchema);
    const db = adminDb();

    // Public self-registration from the Landing Page for Primary Schools, Secondary Schools, Universities & Academies
    if (body.action === "public_register_school") {
      const limited = await checkRateLimit(req, {
        keyPrefix: "public_school_reg",
        limit: 8,
        windowMs: 60_000,
      });
      if (limited) return limited;

      const ref = db.collection("schools").doc();
      const inviteCode = makeSchoolCode(body.name);
      const pilotExpiry = Timestamp.fromMillis(Date.now() + 14 * 86_400_000);
      const seats = body.seatLimit ?? 100;

      await ref.set({
        id: ref.id,
        name: body.name,
        kind: body.kind,
        department: body.department || "",
        principalUid: "",
        principalName: body.contactName,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone || "",
        teacherUids: [],
        inviteCode,
        seatLimit: seats,
        studentCount: 0,
        seatExpiresAt: pilotExpiry,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      await db.collection("institutionInquiries").add({
        institution: body.name,
        kind: body.kind,
        department: body.department || "All Classes / Arms",
        contactRole: body.kind === "primary" || body.kind === "secondary" ? "principal_headteacher" : "hod_dean",
        estimatedStudents: seats,
        estimatedSemesterNgn: seats * 1200,
        contactName: body.contactName,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone || "",
        inviteCode,
        schoolId: ref.id,
        status: "pilot_active",
        createdAt: Timestamp.now(),
      });

      return NextResponse.json({
        ok: true,
        data: {
          schoolId: ref.id,
          schoolName: body.name,
          kind: body.kind,
          inviteCode,
          message: `${body.name} is now registered on SunRoot! Your school invite code is ${inviteCode} (14-day pilot active for ${seats} students).`,
        },
      });
    }

    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, {
      uid: caller.uid,
      keyPrefix: "schools_action",
      limit: 15,
      windowMs: 60_000,
    });
    if (limited) return limited;

    if (body.action === "create_school") {
      const callerSnap = await db.collection("users").doc(caller.uid).get();
      const callerData = callerSnap.data() || {};

      const ref = db.collection("schools").doc();
      const inviteCode = makeSchoolCode(body.name);
      // 14-day pilot license by default so the school principal can test immediately during a live pitch;
      // Admin can extend to 135-day full semester with 1 click once invoice is paid.
      const pilotExpiry = Timestamp.fromMillis(Date.now() + 14 * 86_400_000);
      const seats = body.seatLimit ?? 50;

      await ref.set({
        id: ref.id,
        name: body.name,
        kind: body.kind ?? "university",
        department: body.department || "",
        principalUid: caller.uid,
        principalName: callerData.displayName || callerData.username || "Principal",
        teacherUids: [caller.uid],
        inviteCode,
        seatLimit: seats,
        studentCount: 0,
        seatExpiresAt: pilotExpiry,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Upgrade the creator to school-sponsored plan & link schoolId
      await db
        .collection("users")
        .doc(caller.uid)
        .set(
          {
            schoolId: ref.id,
            institution: body.name,
            ...(body.department ? { department: body.department } : {}),
            plan: "school",
            planExpiresAt: pilotExpiry,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

      return NextResponse.json({
        ok: true,
        data: {
          schoolId: ref.id,
          inviteCode,
          message: `School account created for ${body.name}! Share code ${inviteCode} or register students below.`,
        },
      });
    }

    if (body.action === "join_by_code") {
      const code = body.inviteCode.trim().toUpperCase();
      const snap = await db.collection("schools").where("inviteCode", "==", code).limit(1).get();
      if (snap.empty) {
        throw new ApiError(404, "NOT_FOUND", "No school found with that invite code. Check the code with your Principal or HOD.");
      }

      const schoolDoc = snap.docs[0];
      const sd = schoolDoc.data();
      const expMs = sd.seatExpiresAt?.toMillis?.() || 0;
      if (expMs <= Date.now()) {
        throw new ApiError(403, "LICENSE_EXPIRED", "This school's semester license has expired. Please ask your school administrator to renew.");
      }
      if ((sd.studentCount || 0) >= (sd.seatLimit || 50)) {
        throw new ApiError(403, "SEATS_FULL", "All sponsored student seats for this school are currently filled.");
      }

      const batch = db.batch();
      batch.set(
        db.collection("users").doc(caller.uid),
        {
          schoolId: schoolDoc.id,
          institution: sd.name,
          ...(sd.department ? { department: sd.department } : {}),
          plan: "school",
          planExpiresAt: sd.seatExpiresAt,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      batch.set(
        schoolDoc.ref,
        {
          studentCount: (sd.studentCount || 0) + 1,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      await batch.commit();

      return NextResponse.json({
        ok: true,
        data: {
          schoolId: schoolDoc.id,
          schoolName: sd.name,
          message: `Joined ${sd.name}! Your account is now sponsored by your school.`,
        },
      });
    }

    if (body.action === "register_members") {
      const schoolRef = db.collection("schools").doc(body.schoolId);
      const schoolSnap = await schoolRef.get();
      if (!schoolSnap.exists) {
        throw new ApiError(404, "NOT_FOUND", "School not found.");
      }
      const sd = schoolSnap.data()!;
      const isAllowed =
        caller.role === "admin" ||
        sd.principalUid === caller.uid ||
        (Array.isArray(sd.teacherUids) && sd.teacherUids.includes(caller.uid));

      if (!isAllowed) {
        throw new ApiError(403, "FORBIDDEN", "Only the School Principal, Teachers, or Admin can register members.");
      }

      const cleaned = Array.from(
        new Set(
          body.identifiers
            .map((x) => x.trim().toLowerCase().replace(/^@/, ""))
            .filter((x) => x.length >= 2)
        )
      ).slice(0, 100);

      const usersSnap = await db.collection("users").limit(600).get();
      const matchedDocs = usersSnap.docs.filter((uDoc) => {
        const u = uDoc.data() || {};
        const uname = String(u.username || "").toLowerCase();
        const email = String(u.email || "").toLowerCase();
        return cleaned.includes(uname) || cleaned.includes(email);
      });

      if (matchedDocs.length === 0) {
        throw new ApiError(
          404,
          "NO_MATCHING_USERS",
          "No existing accounts matched those @usernames or emails. Ask students to sign up first or use your school invite code."
        );
      }

      const batch = db.batch();
      const targetRole = body.role ?? "student";
      const newTeacherUids = new Set<string>(Array.isArray(sd.teacherUids) ? sd.teacherUids : []);
      let addedStudents = 0;

      for (const mDoc of matchedDocs) {
        const updates: Record<string, unknown> = {
          schoolId: schoolSnap.id,
          institution: sd.name,
          plan: "school",
          planExpiresAt: sd.seatExpiresAt,
          updatedAt: Timestamp.now(),
        };
        if (body.defaultLevel) updates.level = body.defaultLevel;
        if (body.defaultDepartment || sd.department) {
          updates.department = body.defaultDepartment || sd.department;
        }
        if (targetRole === "teacher") {
          updates.role = "teacher";
          newTeacherUids.add(mDoc.id);
        } else {
          addedStudents += 1;
        }
        batch.set(mDoc.ref, updates, { merge: true });

        const notifRef = mDoc.ref.collection("notifications").doc();
        batch.set(notifRef, {
          type: "school_sponsored",
          title: `${sd.name} Sponsored Your Account!`,
          body: `You have been added to ${sd.name} with full School Plan AI access paid for by your institution.`,
          href: "/schools",
          icon: "school",
          sproutMood: "dance",
          read: false,
          createdAt: Timestamp.now(),
        });
      }

      batch.set(
        schoolRef,
        {
          teacherUids: Array.from(newTeacherUids),
          studentCount: (sd.studentCount || 0) + addedStudents,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      await batch.commit();

      return NextResponse.json({
        ok: true,
        data: {
          registeredCount: matchedDocs.length,
          message: `Successfully registered and sponsored ${matchedDocs.length} ${targetRole}${matchedDocs.length === 1 ? "" : "s"} under ${sd.name}.`,
        },
      });
    }

    if (body.action === "admin_grant_seats") {
      if (caller.role !== "admin") {
        throw new ApiError(403, "FORBIDDEN", "Only platform admins can grant institutional seat licenses.");
      }
      const schoolRef = db.collection("schools").doc(body.schoolId);
      const schoolSnap = await schoolRef.get();
      if (!schoolSnap.exists) {
        throw new ApiError(404, "NOT_FOUND", "School not found.");
      }

      const days = body.days ?? TERM_DAYS;
      const newExpiry = Timestamp.fromMillis(Date.now() + days * 86_400_000);
      await schoolRef.set(
        {
          seatLimit: body.seatLimit,
          seatExpiresAt: newExpiry,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      // Also extend all members currently linked to this schoolId
      const membersSnap = await db.collection("users").where("schoolId", "==", body.schoolId).limit(450).get();
      if (!membersSnap.empty) {
        const batch = db.batch();
        for (const mDoc of membersSnap.docs) {
          batch.set(mDoc.ref, { plan: "school", planExpiresAt: newExpiry, updatedAt: Timestamp.now() }, { merge: true });
        }
        await batch.commit();
      }

      return NextResponse.json({
        ok: true,
        data: {
          schoolId: body.schoolId,
          seatLimit: body.seatLimit,
          seatExpiresAt: newExpiry.toDate().toISOString(),
          upgradedMembers: membersSnap.size,
        },
      });
    }

    if (body.action === "school_announce") {
      const schoolRef = db.collection("schools").doc(body.schoolId);
      const schoolSnap = await schoolRef.get();
      if (!schoolSnap.exists) {
        throw new ApiError(404, "NOT_FOUND", "School not found.");
      }
      const sd = schoolSnap.data()!;
      const isAllowed =
        caller.role === "admin" ||
        sd.principalUid === caller.uid ||
        (Array.isArray(sd.teacherUids) && sd.teacherUids.includes(caller.uid));

      if (!isAllowed) {
        throw new ApiError(403, "FORBIDDEN", "Only the School Principal, Teachers, or Admin can send school-wide announcements.");
      }

      const schoolNameLower = String(sd.name || "").toLowerCase();
      const usersSnap = await db.collection("users").limit(600).get();
      const recipients = usersSnap.docs.filter((uDoc) => {
        const u = uDoc.data() || {};
        if (u.schoolId === body.schoolId) return true;
        if (schoolNameLower && String(u.institution || "").toLowerCase() === schoolNameLower) return true;
        return false;
      });

      const now = Timestamp.now();
      let sent = 0;
      for (let i = 0; i < recipients.length; i += 400) {
        const chunk = recipients.slice(i, i + 400);
        const batch = db.batch();
        for (const rDoc of chunk) {
          const nRef = rDoc.ref.collection("notifications").doc();
          batch.set(nRef, {
            type: "school_announcement",
            title: `[${sd.name}] ${body.title}`,
            body: body.body,
            href: "/schools",
            icon: "school",
            sproutMood: "wave",
            read: false,
            senderUid: caller.uid,
            createdAt: now,
          });
          sent++;
        }
        await batch.commit();
      }

      return NextResponse.json({
        ok: true,
        data: {
          deliveredCount: sent,
          message: `Announcement delivered to ${sent} member${sent === 1 ? "" : "s"} in ${sd.name}.`,
        },
      });
    }

    throw new ApiError(400, "INVALID_ACTION", "Unsupported school action.");
  } catch (error) {
    return handleAuthError(error);
  }
}
