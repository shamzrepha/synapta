import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { validateAndPruneCycles } from "@/lib/teacher/classBuilder";
import { pushClassContent, type PushAllResult } from "@/lib/classes/publish-all";
import { getActiveStudentUids } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const access = await assertClassAccess(caller, id, "mutate");

    const kcsSnap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("kcs")
      .get();

    if (kcsSnap.empty) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "EMPTY_COURSE",
            message: "Cannot publish course: At least one topic must exist in the curriculum.",
          },
        },
        { status: 400 }
      );
    }

    const kcs = kcsSnap.docs.map((d) => ({
      id: d.id,
      prerequisiteIds: ((d.data().prerequisiteIds as string[]) || []),
      status: (d.data().status as string) || "draft",
    }));

    // Verify DAG cycle free
    const { hasCycle } = validateAndPruneCycles(kcs);
    if (hasCycle) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "CYCLE_DETECTED",
            message: "Cannot publish class: concept map contains circular prerequisite dependencies. Please review the graph.",
          },
        },
        { status: 400 }
      );
    }

    // Publish all active KCs and the class document
    const batch = adminDb().batch();
    for (const d of kcsSnap.docs) {
      if (d.data().status !== "archived") {
        batch.update(d.ref, { status: "published", updatedAt: Timestamp.now() });
      }
    }

    const classRef = adminDb().collection("classes").doc(id);
    batch.update(classRef, {
      status: "published",
      buildState: "ready",
      updatedAt: Timestamp.now(),
    });

    await batch.commit();

    // Publishing the class also pushes whatever the teacher has created, so students never open a class
    // that is "live" but empty. (Content stays a private draft only if the teacher takes it offline.)
    const fresh = await adminDb().collection("classes").doc(id).collection("kcs").get();
    const content = await pushClassContent(caller, id, fresh.docs, true).catch(
      (): PushAllResult => ({ pushed: 0, skipped: ["Content couldn't be pushed. Use Publish all content."], emptyTopics: [] })
    );
    if (content.pushed) {
      const uids = await getActiveStudentUids(id).catch(() => [] as string[]);
      await notifyMany(uids, { type: "system", title: `New material in “${String(access.classData.title || "your class")}”`, body: "Your teacher published new lessons and practice.", href: `/classes/${id}`, icon: "📣" }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      data: { status: "published", publishedKcs: kcsSnap.size, ...content },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
