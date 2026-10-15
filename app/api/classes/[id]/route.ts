import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getClassAccess, assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { updateClassSchema } from "@/lib/validation/classes";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);

    const access = await getClassAccess(caller, id);
    const { classData, isOwner, isAdmin, enrollmentStatus, role } = access;

    // Not a member: landing page only. Opening a shared link never unlocks lessons by itself.
    if (!access.canView) {
      const outline = access.canPreview
        ? (await adminDb().collection("classes").doc(id).collection("kcs").orderBy("order", "asc").get()).docs
            .map((d) => ({ id: d.id, ...(d.data() as { title?: string; status?: string; summary?: string; description?: string; order?: number }) }))
            .filter((k) => k.status !== "draft" && k.status !== "archived")
            .map((k) => ({ id: k.id, title: k.title || "Topic", summary: String(k.summary || k.description || "").slice(0, 160), order: k.order ?? 0, status: "published", locked: true }))
        : [];
      return NextResponse.json({
        ok: true,
        data: {
          class: {
            id,
            title: classData.title,
            subject: classData.subject,
            description: access.canPreview ? classData.description : "",
            teacherName: classData.teacherName,
            visibility: classData.visibility,
            studentCount: classData.studentCount || 0,
            status: classData.status,
            level: classData.level || "undergrad",
            audienceTags: classData.audienceTags || [],
            buildState: classData.buildState || "empty",
          },
          kcs: outline,
          masteryMap: {},
          attemptsMap: {},
          role: "visitor",
          enrollmentStatus,
          isOwner: false,
          accessDenied: true,
          preview: access.canPreview,
        },
      });
    }

    // Load KCs - students only see published KCs; owners/admins see all
    const kcsQuery = adminDb()
      .collection("classes")
      .doc(id)
      .collection("kcs")
      .orderBy("order", "asc");

    const kcsSnap = await kcsQuery.get();
    let kcs = kcsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (role === "student" || role === "visitor") {
      kcs = kcs.filter((k) => (k as { status?: string }).status !== "draft" && (k as { status?: string }).status !== "archived");
    }

    // Load caller's mastery for these KCs
    const masteryMap: Record<string, number> = {};
    const attemptsMap: Record<string, number> = {};
    if (kcs.length > 0 && caller.uid) {
      // One batched read instead of a round-trip per topic
      const masteryDocs = await adminDb().getAll(
        ...kcs.map((kc) => adminDb().collection("mastery").doc(`${caller.uid}_${kc.id}`))
      );
      for (let i = 0; i < kcs.length; i++) {
        const kc = kcs[i];
        const mDoc = masteryDocs[i];
        if (mDoc.exists) {
          const mData = mDoc.data();
          masteryMap[kc.id] = mData?.pL ?? 0.2;
          attemptsMap[kc.id] = mData?.attempts ?? 0;
        } else {
          masteryMap[kc.id] = (kc as { bkt?: { pL0?: number } })?.bkt?.pL0 ?? 0.2;
          attemptsMap[kc.id] = 0;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        // The join code is an invite credential: only teachers/admins see it
        class: isOwner || isAdmin ? { id, ...classData } : { id, ...classData, joinCode: undefined },
        kcs,
        masteryMap,
        attemptsMap,
        role,
        enrollmentStatus,
        isOwner: isOwner || isAdmin,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const body = await req.json();
    const parsed = updateClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }

    const classRef = adminDb().collection("classes").doc(id);
    const updatePayload = {
      ...parsed.data,
      updatedAt: Timestamp.now(),
    };

    await classRef.update(updatePayload);
    const updatedDoc = await classRef.get();

    return NextResponse.json({
      ok: true,
      data: { status: "updated", class: { id, ...updatedDoc.data() } },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    await adminDb().collection("classes").doc(id).delete();

    // Audit log
    await adminDb().collection("auditLogs").add({
      actorUid: caller.uid,
      action: "class.deleted",
      targetType: "class",
      targetId: id,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: { status: "deleted", classId: id },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
