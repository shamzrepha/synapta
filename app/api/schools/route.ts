import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { TERM_DAYS } from "@/lib/billing/plans";
import { LEARNING_COHORTS, type LearningCohortId } from "@/lib/learning/telemetry";
import { canAssignTeachers, canManageSchool, makeSchoolCode, membershipFor, sponsorshipPatch } from "@/lib/schools/policy";
import { loadCampuses } from "@/lib/schools/standings";

export const runtime = "nodejs";

const SCHOOL_KINDS = ["primary", "secondary", "university", "polytechnic", "college", "academy"] as const;

/** A self-registered school gets a free 14-day pilot, so the size of that pilot is capped. An admin raises it after an invoice is paid. */
const PUBLIC_PILOT_MAX_SEATS = 200;
/** The same cap for a signed-in user starting a school: bigger numbers come with an invoice, granted by an admin. */
const PILOT_MAX_SEATS = 500;
/** Most members one school read, notification fan-out or roster ever touches in a single request. */
const MEMBER_READ_LIMIT = 1000;

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_school"),
    name: z.string().trim().min(3).max(140),
    kind: z.enum(SCHOOL_KINDS).default("university"),
    department: z.string().trim().max(120).optional().default(""),
    seatLimit: z.number().int().min(10).max(PILOT_MAX_SEATS).optional().default(50),
  }),
  z.object({
    action: z.literal("public_register_school"),
    name: z.string().trim().min(3).max(140),
    kind: z.enum(SCHOOL_KINDS).default("secondary"),
    department: z.string().trim().max(120).optional().default(""),
    contactName: z.string().trim().min(2).max(100),
    contactEmail: z.string().trim().email().max(140),
    contactPhone: z.string().trim().max(40).optional().default(""),
    seatLimit: z.number().int().min(10).max(PUBLIC_PILOT_MAX_SEATS).optional().default(100),
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

type Db = FirebaseFirestore.Firestore;

async function standings(): Promise<InterUniStanding[]> {
  const campuses = await loadCampuses();
  return campuses.slice(0, 20).map((c, idx) => ({
    rank: idx + 1,
    institution: c.institution,
    studentCount: c.studentCount,
    totalXp: c.totalXp,
    avgXp: Math.round(c.totalXp / Math.max(1, c.studentCount)),
    avgReadiness: Math.round(c.readinessSum / Math.max(1, c.studentCount)),
    topScholarName: c.topScholarName || "Scholar",
    topScholarXp: Math.max(0, c.topScholarXp),
  }));
}

/** The school this caller is looking at: the one they asked for if they may see it, else the one they belong to or run. Looked up directly, never by scanning. */
async function findActiveSchool(db: Db, caller: { uid: string; role: string }, callerSchoolId: string, requestedId: string) {
  const byId = async (id: string) => {
    if (!id) return null;
    const s = await db.collection("schools").doc(id).get();
    return s.exists ? s : null;
  };
  if (requestedId) {
    const s = await byId(requestedId);
    if (s && (canManageSchool(caller, s.data() || {}) || callerSchoolId === s.id)) return s;
  }
  const own = await byId(callerSchoolId);
  if (own) return own;
  const asTeacher = await db.collection("schools").where("teacherUids", "array-contains", caller.uid).limit(1).get();
  if (!asTeacher.empty) return asTeacher.docs[0];
  const asPrincipal = await db.collection("schools").where("principalUid", "==", caller.uid).limit(1).get();
  return asPrincipal.empty ? null : asPrincipal.docs[0];
}

/**
 * GET /api/schools
 * ?mode=directory  public list of school names (for sign-up and the landing page)
 * ?mode=standings  just the Inter-University Cup table
 * default          the caller's own school (principal/teacher get the roster, a student only the totals), the Cup table,
 *                  and, for a platform admin, every school.
 */
export async function GET(req: NextRequest) {
  try {
    const db = adminDb();
    const mode = req.nextUrl.searchParams.get("mode") || "";

    if (mode === "directory") {
      const limited = await checkRateLimit(req, { keyPrefix: "school_directory", limit: 60, windowMs: 60_000 });
      if (limited) return limited;
      const schoolsSnap = await db.collection("schools").orderBy("createdAt", "desc").limit(100).get();
      const registeredSchools = schoolsSnap.docs
        .map((d) => {
          const sd = d.data() || {};
          return { id: d.id, name: String(sd.name || ""), kind: String(sd.kind || "university"), department: String(sd.department || "") };
        })
        .filter((s) => s.name.length > 0);
      return NextResponse.json({ ok: true, data: { registeredSchools } });
    }

    const caller = await requireUser(req);

    if (mode === "standings") {
      return NextResponse.json({ ok: true, data: { interUniStandings: await standings() } });
    }

    const callerDoc = await db.collection("users").doc(caller.uid).get();
    const callerData = callerDoc.data() || {};
    const callerSchoolId = typeof callerData.schoolId === "string" ? callerData.schoolId.trim() : "";
    const requestedSchoolId = (req.nextUrl.searchParams.get("schoolId") || "").slice(0, 120);

    const [activeSchoolDoc, interUniStandings] = await Promise.all([
      findActiveSchool(db, caller, callerSchoolId, requestedSchoolId),
      standings(),
    ]);

    let mySchool: Record<string, unknown> | null = null;
    if (activeSchoolDoc) {
      const sd = activeSchoolDoc.data() || {};
      const isManager = canManageSchool(caller, sd);

      // Members are the accounts linked to this school id. A name typed into a profile does not make anyone a member.
      const membersSnap = await db.collection("users").where("schoolId", "==", activeSchoolDoc.id).limit(MEMBER_READ_LIMIT).get();

      const students: SchoolStudentRow[] = membersSnap.docs.map((mDoc) => {
        const u = mDoc.data() || {};
        const tp = u.telemetryProfile || {};
        const cohortId = (tp.dominantCohort || "step_by_step_procedural") as LearningCohortId;
        const readiness = typeof tp.predictedExamReadiness === "number" ? tp.predictedExamReadiness : 65;
        const studyMs = typeof tp.totalStudyTimeMs === "number" ? tp.totalStudyTimeMs : 0;
        return {
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
        };
      });
      students.sort((a, b) => b.xp - a.xp);

      const seatExpiresMs = sd.seatExpiresAt?.toMillis?.() || (typeof sd.seatExpiresAt === "number" ? sd.seatExpiresAt : 0);

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
        avgReadiness: students.length > 0 ? Math.round(students.reduce((acc, s) => acc + s.predictedReadiness, 0) / students.length) : 68,
        atRiskCount: isManager ? students.filter((s) => s.role === "student" && s.atRisk).length : 0,
        totalStudyMinutes: students.reduce((acc, s) => acc + s.totalStudyMinutes, 0),
        // Per-student progress is for the people who run the school; a classmate only gets the totals above.
        roster: isManager ? students : [],
      };
    }

    let allSchools: Array<Record<string, unknown>> = [];
    if (caller.role === "admin") {
      const schoolsSnap = await db.collection("schools").orderBy("createdAt", "desc").limit(50).get();
      allSchools = schoolsSnap.docs.map((d) => {
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
      });
    }

    return NextResponse.json({ ok: true, data: { mySchool, interUniStandings, allSchools } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** An invite code that no other school has, so one code never opens two schools. */
async function freshInviteCode(db: Db, name: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = makeSchoolCode(name);
    const clash = await db.collection("schools").where("inviteCode", "==", code).limit(1).get();
    if (clash.empty) return code;
  }
  throw new ApiError(503, "TRY_AGAIN", "Could not create a unique school code. Please try again.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, postSchema);
    const db = adminDb();

    // Public self-registration from the landing page. Signed-out, so it is limited per IP and across all server instances.
    if (body.action === "public_register_school") {
      const limited = await checkRateLimit(req, { keyPrefix: "public_school_reg", limit: 3, windowMs: 3_600_000, shared: true });
      if (limited) return limited;

      const ref = db.collection("schools").doc();
      const inviteCode = await freshInviteCode(db, body.name);
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
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "schools_action", limit: 15, windowMs: 60_000 });
    if (limited) return limited;

    if (body.action === "create_school") {
      const costly = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "schools_create", limit: 3, windowMs: 3_600_000, shared: true });
      if (costly) return costly;

      const callerRef = db.collection("users").doc(caller.uid);
      const callerData = (await callerRef.get()).data() || {};
      if (membershipFor(callerData, "") !== "join") {
        throw new ApiError(409, "ALREADY_IN_SCHOOL", "Your account already belongs to a school. One account can belong to one school.");
      }

      const ref = db.collection("schools").doc();
      const inviteCode = await freshInviteCode(db, body.name);
      // 14-day pilot licence by default; an admin extends to a full 135-day semester once the invoice is paid.
      const pilotExpiry = Timestamp.fromMillis(Date.now() + 14 * 86_400_000);
      const seats = body.seatLimit ?? 50;

      const batch = db.batch();
      batch.set(ref, {
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
      batch.set(
        callerRef,
        {
          schoolId: ref.id,
          institution: body.name,
          ...(body.department ? { department: body.department } : {}),
          ...sponsorshipPatch(callerData, pilotExpiry),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      await batch.commit();

      return NextResponse.json({
        ok: true,
        data: { schoolId: ref.id, inviteCode, message: `School account created for ${body.name}! Share code ${inviteCode} or register students below.` },
      });
    }

    if (body.action === "join_by_code") {
      const guess = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "schools_join", limit: 8, windowMs: 600_000 });
      if (guess) return guess;

      const code = body.inviteCode.trim().toUpperCase();
      const snap = await db.collection("schools").where("inviteCode", "==", code).limit(1).get();
      if (snap.empty) {
        throw new ApiError(404, "NOT_FOUND", "No school found with that invite code. Check the code with your Principal or HOD.");
      }
      const schoolRef = snap.docs[0].ref;
      const userRef = db.collection("users").doc(caller.uid);

      // Seat count and the one-school rule are checked and written together, so two students racing for the last seat cannot both get it.
      const result = await db.runTransaction(async (tx) => {
        const [schoolSnap, userSnap] = await Promise.all([tx.get(schoolRef), tx.get(userRef)]);
        const sd = schoolSnap.data() || {};
        const u = userSnap.data() || {};
        const verdict = membershipFor(u, schoolSnap.id);
        if (verdict === "other_school") {
          throw new ApiError(409, "ALREADY_IN_SCHOOL", "Your account already belongs to another school. Ask your school administrator to move you.");
        }
        if (verdict === "already_here") return { id: schoolSnap.id, name: String(sd.name || "") };
        const expMs = sd.seatExpiresAt?.toMillis?.() || 0;
        if (expMs <= Date.now()) {
          throw new ApiError(403, "LICENSE_EXPIRED", "This school's semester license has expired. Please ask your school administrator to renew.");
        }
        if ((sd.studentCount || 0) >= (sd.seatLimit || 50)) {
          throw new ApiError(403, "SEATS_FULL", "All sponsored student seats for this school are currently filled.");
        }
        tx.set(
          userRef,
          {
            schoolId: schoolSnap.id,
            institution: sd.name,
            ...(sd.department ? { department: sd.department } : {}),
            ...sponsorshipPatch(u, sd.seatExpiresAt),
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
        tx.set(schoolRef, { studentCount: (sd.studentCount || 0) + 1, updatedAt: Timestamp.now() }, { merge: true });
        return { id: schoolSnap.id, name: String(sd.name || "") };
      });

      return NextResponse.json({
        ok: true,
        data: { schoolId: result.id, schoolName: result.name, message: `Joined ${result.name}! Your account is now sponsored by your school.` },
      });
    }

    if (body.action === "register_members") {
      const schoolRef = db.collection("schools").doc(body.schoolId);
      const schoolSnap = await schoolRef.get();
      if (!schoolSnap.exists) throw new ApiError(404, "NOT_FOUND", "School not found.");
      const sd = schoolSnap.data() || {};

      if (!canManageSchool(caller, sd)) {
        throw new ApiError(403, "FORBIDDEN", "Only the School Principal, Teachers, or Admin can register members.");
      }
      const targetRole = body.role ?? "student";
      if (targetRole === "teacher" && !canAssignTeachers(caller, sd)) {
        throw new ApiError(403, "FORBIDDEN", "Only a platform admin, or the principal of a verified school, can add teachers.");
      }

      const cleaned = Array.from(new Set(body.identifiers.map((x) => x.trim().toLowerCase().replace(/^@/, "")).filter((x) => x.length >= 2))).slice(0, 100);

      // Exact lookups (10 values per query is Firestore's limit), not a scan of the first 600 users.
      const found = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (let i = 0; i < cleaned.length; i += 10) {
        const chunk = cleaned.slice(i, i + 10);
        const [byName, byEmail] = await Promise.all([
          db.collection("users").where("username", "in", chunk).limit(20).get(),
          db.collection("users").where("email", "in", chunk).limit(20).get(),
        ]);
        for (const d of [...byName.docs, ...byEmail.docs]) found.set(d.id, d);
      }
      if (found.size === 0) {
        throw new ApiError(404, "NO_MATCHING_USERS", "No existing accounts matched those @usernames or emails. Ask students to sign up first or use your school invite code.");
      }

      const batch = db.batch();
      const newTeacherUids = new Set<string>(Array.isArray(sd.teacherUids) ? sd.teacherUids : []);
      let addedStudents = 0;
      let registered = 0;
      let skipped = 0;

      for (const mDoc of found.values()) {
        const u = mDoc.data() || {};
        const verdict = membershipFor(u, schoolSnap.id);
        // One school per account, and platform admins are never re-roled or sponsored.
        if (verdict === "other_school" || u.role === "admin") {
          skipped += 1;
          continue;
        }
        const updates: Record<string, unknown> = {
          schoolId: schoolSnap.id,
          institution: sd.name,
          ...sponsorshipPatch(u, sd.seatExpiresAt),
          updatedAt: Timestamp.now(),
        };
        if (body.defaultLevel) updates.level = body.defaultLevel;
        if (body.defaultDepartment || sd.department) updates.department = body.defaultDepartment || sd.department;
        if (targetRole === "teacher") {
          updates.role = "teacher";
          newTeacherUids.add(mDoc.id);
        } else if (verdict === "join") {
          addedStudents += 1;
        }
        registered += 1;
        batch.set(mDoc.ref, updates, { merge: true });

        if (verdict === "join") {
          batch.set(mDoc.ref.collection("notifications").doc(), {
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
      }

      if ((sd.studentCount || 0) + addedStudents > (sd.seatLimit || 50)) {
        throw new ApiError(403, "SEATS_FULL", "That would go over this school's sponsored seats. Ask an admin to raise the seat limit.");
      }
      if (registered === 0) {
        throw new ApiError(409, "NOTHING_TO_REGISTER", "Those accounts already belong to another school, or cannot be added.");
      }

      batch.set(
        schoolRef,
        { teacherUids: Array.from(newTeacherUids), studentCount: FieldValue.increment(addedStudents), updatedAt: Timestamp.now() },
        { merge: true }
      );
      await batch.commit();

      return NextResponse.json({
        ok: true,
        data: {
          registeredCount: registered,
          skippedCount: skipped,
          message: `Successfully registered and sponsored ${registered} ${targetRole}${registered === 1 ? "" : "s"} under ${sd.name}.${skipped ? ` ${skipped} could not be added (already in another school).` : ""}`,
        },
      });
    }

    if (body.action === "admin_grant_seats") {
      if (caller.role !== "admin") {
        throw new ApiError(403, "FORBIDDEN", "Only platform admins can grant institutional seat licenses.");
      }
      const schoolRef = db.collection("schools").doc(body.schoolId);
      const schoolSnap = await schoolRef.get();
      if (!schoolSnap.exists) throw new ApiError(404, "NOT_FOUND", "School not found.");

      const days = body.days ?? TERM_DAYS;
      const newExpiry = Timestamp.fromMillis(Date.now() + days * 86_400_000);
      await schoolRef.set({ seatLimit: body.seatLimit, seatExpiresAt: newExpiry, verified: true, updatedAt: Timestamp.now() }, { merge: true });

      // Also extend the members who are on the school's sponsorship (anyone who paid for their own plan keeps it)
      const membersSnap = await db.collection("users").where("schoolId", "==", body.schoolId).limit(450).get();
      if (!membersSnap.empty) {
        const batch = db.batch();
        for (const mDoc of membersSnap.docs) {
          batch.set(mDoc.ref, { ...sponsorshipPatch(mDoc.data() || {}, newExpiry), updatedAt: Timestamp.now() }, { merge: true });
        }
        await batch.commit();
      }

      return NextResponse.json({
        ok: true,
        data: { schoolId: body.schoolId, seatLimit: body.seatLimit, seatExpiresAt: newExpiry.toDate().toISOString(), upgradedMembers: membersSnap.size },
      });
    }

    if (body.action === "school_announce") {
      const schoolRef = db.collection("schools").doc(body.schoolId);
      const schoolSnap = await schoolRef.get();
      if (!schoolSnap.exists) throw new ApiError(404, "NOT_FOUND", "School not found.");
      const sd = schoolSnap.data() || {};

      if (!canManageSchool(caller, sd)) {
        throw new ApiError(403, "FORBIDDEN", "Only the School Principal, Teachers, or Admin can send school-wide announcements.");
      }
      // A broadcast writes one notification per member, so it is limited harder than other school actions.
      const spam = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "schools_announce", limit: 5, windowMs: 600_000, shared: true });
      if (spam) return spam;

      const recipients = (await db.collection("users").where("schoolId", "==", body.schoolId).limit(MEMBER_READ_LIMIT).get()).docs;

      const now = Timestamp.now();
      let sent = 0;
      for (let i = 0; i < recipients.length; i += 400) {
        const batch = db.batch();
        for (const rDoc of recipients.slice(i, i + 400)) {
          batch.set(rDoc.ref.collection("notifications").doc(), {
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
        data: { deliveredCount: sent, message: `Announcement delivered to ${sent} member${sent === 1 ? "" : "s"} in ${sd.name}.` },
      });
    }

    throw new ApiError(400, "INVALID_ACTION", "Unsupported school action.");
  } catch (error) {
    return handleAuthError(error);
  }
}
