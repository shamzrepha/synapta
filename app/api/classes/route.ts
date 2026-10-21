import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { createClassSchema, generateSecureJoinCode } from "@/lib/validation/classes";
import { parseJson } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const {
      title,
      subject,
      description,
      level,
      audienceTags,
      durationWeeks,
      visibility,
      status,
      buildState,
      audioLessons,
      narratorVoice,
      recommendedPlan,
    } = await parseJson(req, createClassSchema);

    // Fetch teacher display name
    let teacherName = "Teacher";
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    if (userDoc.exists) {
      teacherName = userDoc.data()?.displayName || caller.email?.split("@")[0] || "Teacher";
    }

    const classRef = adminDb().collection("classes").doc();

    const newClass = {
      id: classRef.id,
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      level: level || "undergrad",
      audienceTags: audienceTags || [],
      durationWeeks: durationWeeks || 4,
      teacherId: caller.uid,
      coTeacherIds: [] as string[],
      teacherName,
      visibility: visibility || "public",
      status: status || (buildState === "drafting" ? "draft" : "published"),
      buildState: buildState || "empty",
      audioLessons: audioLessons !== false,
      narratorVoice: narratorVoice || "female",
      ...(recommendedPlan && JSON.stringify(recommendedPlan).length < 60000 ? { recommendedPlan } : {}),
      joinCode: await (async () => {
        let code = generateSecureJoinCode();
        for (let attempts = 0; attempts < 3; attempts++) {
          const existing = await adminDb().collection("classes").where("joinCode", "==", code).limit(1).get();
          if (existing.empty) break;
          code = generateSecureJoinCode();
        }
        return code;
      })(),
      studentCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Ownership is implicit: teacher owns the class. NO teacher enrollment document is created.
    await classRef.set(newClass);

    // Returns single created class object
    return NextResponse.json({
      ok: true,
      data: newClass,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "explore";

    let caller = null;
    try {
      caller = await requireUser(req);
    } catch {
      // Unauthenticated browse is allowed for explore
    }

    if (scope === "mine") {
      if (!caller) {
        return NextResponse.json(
          { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to view your classes" } },
          { status: 401 }
        );
      }

      if (caller.role === "teacher" || caller.role === "admin") {
        // Teacher view: get classes they created or co-teach, PLUS any classes they are actively enrolled in
        const isAdminCaller = caller.role === "admin";
        const [ownedSnap, coSnap, enrollmentsSnap] = await Promise.all([
          // an administrator sees every class (they can open, edit and publish any of them)
          isAdminCaller ? adminDb().collection("classes").limit(500).get() : adminDb().collection("classes").where("teacherId", "==", caller.uid).get(),
          adminDb().collection("classes").where("coTeacherIds", "array-contains", caller.uid).get(),
          adminDb().collection("enrollments").where("uid", "==", caller.uid).where("status", "==", "active").get(),
        ]);

        const classMap = new Map<string, Record<string, unknown>>();
        for (const doc of ownedSnap.docs) {
          classMap.set(doc.id, { id: doc.id, ...doc.data(), isOwner: true, userEnrollmentStatus: "none" });
        }
        if (isAdminCaller) {
          // classes the admin joined as a student keep their student status
          for (const e of enrollmentsSnap.docs) {
            const cid = e.data().classId as string;
            const cur = classMap.get(cid);
            if (cur && cur.teacherId !== caller.uid) classMap.set(cid, { ...cur, isOwner: true, userEnrollmentStatus: "active" });
          }
        }
        for (const doc of coSnap.docs) {
          classMap.set(doc.id, { id: doc.id, ...doc.data(), isOwner: true, userEnrollmentStatus: "none" });
        }

        // Include any active student enrollments so teacher role change preserves previous student enrollments
        const enrolledClassIds = enrollmentsSnap.docs
          .map((d) => d.data().classId as string)
          .filter((cid) => cid && !classMap.has(cid));

        if (enrolledClassIds.length > 0) {
          const enrolledRefs = enrolledClassIds.map((cid) => adminDb().collection("classes").doc(cid));
          const enrolledDocs = await adminDb().getAll(...enrolledRefs);
          for (const d of enrolledDocs) {
            if (d.exists) {
              classMap.set(d.id, {
                id: d.id,
                ...d.data(),
                joinCode: undefined,
                isOwner: false,
                userEnrollmentStatus: "active",
              });
            }
          }
        }

        const classes = Array.from(classMap.values()).sort((a, b) => {
          const tA = (a.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
          const tB = (b.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
          return tB - tA;
        });

        // Always returns a direct array under data
        return NextResponse.json({ ok: true, data: classes });
      } else {
        // Student view: get classes where enrollment is active (excluding legacy teacher enrollments)
        const enrollmentsSnap = await adminDb()
          .collection("enrollments")
          .where("uid", "==", caller.uid)
          .where("status", "==", "active")
          .get();

        const studentEnrollments = enrollmentsSnap.docs.filter(
          (d) => d.data().role !== "teacher"
        );

        const classIds = studentEnrollments.map((d) => d.data().classId as string);
        if (classIds.length === 0) {
          return NextResponse.json({ ok: true, data: [] });
        }

        const classRefs = classIds.map((cid) => adminDb().collection("classes").doc(cid));
        const classDocs = await adminDb().getAll(...classRefs);

        const classes = classDocs
          .filter((d) => d.exists)
          .map((d) => ({
            id: d.id,
            ...d.data(),
            joinCode: undefined,
            userEnrollmentStatus: "active",
          }));

        // Always returns a direct array under data
        return NextResponse.json({ ok: true, data: classes });
      }
    }

    // Default: explore scope (retrieves published classes with limit 50)
    const snap = await adminDb().collection("classes").limit(caller?.role === "admin" ? 500 : 50).get();

    // Map user enrollment status if signed in
    const userEnrollments: Record<string, string> = {};
    if (caller) {
      const eSnap = await adminDb()
        .collection("enrollments")
        .where("uid", "==", caller.uid)
        .get();
      eSnap.forEach((d) => {
        const data = d.data();
        if (data.role !== "teacher") {
          userEnrollments[data.classId] = data.status;
        }
      });
    }

    const classes = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const coTeacherIds = Array.isArray(data.coTeacherIds) ? (data.coTeacherIds as string[]) : [];
        const isCoTeacher = caller ? coTeacherIds.includes(caller.uid) : false;
        const isOwner = caller ? (data.teacherId === caller.uid || isCoTeacher) : false;
        return {
          id: d.id,
          ...data,
          // The join code is an invite credential: only the class's teachers (and admins) see it
          joinCode: isOwner || caller?.role === "admin" ? data.joinCode : undefined,
          userEnrollmentStatus: userEnrollments[d.id] || "none",
          isOwner,
        };
      })
      .filter((c: Record<string, unknown>) => {
        // Show if published, or if caller is owner or admin
        if (c.status === "published") return true;
        if (caller && (c.isOwner || caller.role === "admin")) return true;
        return false;
      })
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const tA = (a.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
        const tB = (b.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
        return tB - tA;
      });

    // Always returns a direct array under data
    return NextResponse.json({ ok: true, data: classes });
  } catch (error) {
    return handleAuthError(error);
  }
}
