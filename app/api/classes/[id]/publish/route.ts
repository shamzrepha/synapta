import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { validateAndPruneCycles } from "@/lib/teacher/classBuilder";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

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

    // Publish all draft KCs and the class document
    const batch = adminDb().batch();
    for (const d of kcsSnap.docs) {
      if (d.data().status === "draft") {
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

    return NextResponse.json({
      ok: true,
      data: { status: "published", publishedKcs: kcsSnap.size },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
