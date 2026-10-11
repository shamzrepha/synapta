import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { createClassSchema } from "@/lib/validation/classes";

export const runtime = "nodejs";

function generateJoinCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `SYN-${num}`;
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await req.json();
    const parsed = createClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }

    const { title, subject, description, visibility, status } = parsed.data;

    // Fetch teacher name
    let teacherName = "Teacher";
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    if (userDoc.exists) {
      teacherName = userDoc.data()?.displayName || caller.email?.split("@")[0] || "Teacher";
    }

    const classRef = adminDb().collection("classes").doc();
    const resolvedVisibility = visibility || "public";
    const resolvedStatus = status || "published";

    const newClass = {
      id: classRef.id,
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      teacherId: caller.uid,
      teacherName,
      visibility: resolvedVisibility,
      status: resolvedStatus,
      joinCode: generateJoinCode(),
      studentCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Atomic batch: write class document AND teacher active enrollment
    const batch = adminDb().batch();
    batch.set(classRef, newClass);

    const teacherEnrollmentRef = adminDb()
      .collection("enrollments")
      .doc(`${classRef.id}_${caller.uid}`);

    batch.set(teacherEnrollmentRef, {
      classId: classRef.id,
      uid: caller.uid,
      userEmail: caller.email,
      role: "teacher",
      status: "active",
      joinedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      data: { class: newClass },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "explore";

    // Caller is optional on explore, but required on mine
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
        // Teacher view: get classes they created
        const snap = await adminDb()
          .collection("classes")
          .where("teacherId", "==", caller.uid)
          .get();

        const classes = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => {
            const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return tB - tA;
          });

        return NextResponse.json({ ok: true, data: { classes } });
      } else {
        // Student view: get classes where enrollment is active
        const enrollmentsSnap = await adminDb()
          .collection("enrollments")
          .where("uid", "==", caller.uid)
          .where("status", "==", "active")
          .get();

        const classIds = enrollmentsSnap.docs.map((d) => d.data().classId);
        if (classIds.length === 0) {
          return NextResponse.json({ ok: true, data: { classes: [] } });
        }

        const classes = [];
        for (const cid of classIds) {
          const cDoc = await adminDb().collection("classes").doc(cid).get();
          if (cDoc.exists) {
            classes.push({ id: cDoc.id, ...cDoc.data(), userEnrollmentStatus: "active" });
          }
        }
        return NextResponse.json({ ok: true, data: { classes } });
      }
    }

    // Default: explore scope (retrieves published classes without failing on missing composite index)
    const snap = await adminDb().collection("classes").get();

    // Map user enrollment status if signed in
    const userEnrollments: Record<string, string> = {};
    if (caller) {
      const eSnap = await adminDb()
        .collection("enrollments")
        .where("uid", "==", caller.uid)
        .get();
      eSnap.forEach((d) => {
        const data = d.data();
        userEnrollments[data.classId] = data.status;
      });
    }

    const classes = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          userEnrollmentStatus: userEnrollments[d.id] || "none",
          isOwner: caller ? data.teacherId === caller.uid : false,
        };
      })
      .filter((c: any) => {
        // Show if published (both public & private so students can view & request to join),
        // or if caller is the creator teacher / admin
        if (c.status === "published") return true;
        if (caller && (c.teacherId === caller.uid || caller.role === "admin")) return true;
        return false;
      })
      .sort((a: any, b: any) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA;
      });

    return NextResponse.json({ ok: true, data: { classes } });
  } catch (error) {
    return handleAuthError(error);
  }
}
