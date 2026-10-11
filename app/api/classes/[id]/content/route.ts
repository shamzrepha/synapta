import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "view");

    const snap = await adminDb()
      .collection("contentCache")
      .where("classId", "==", classId)
      .orderBy("createdAt", "desc")
      .get();

    let totalCacheHits = 0;
    const items = snap.docs.map((doc) => {
      const d = doc.data();
      const hits = d.cacheHits || 0;
      totalCacheHits += hits;
      return {
        hash: doc.id,
        status: (d.status as string) || "draft",
        ...d,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : null,
      };
    });

    // Estimate cost saved: ~1,200 tokens per call avoided * ~$0.0001 per call
    const estimatedTokensSaved = totalCacheHits * 1200;
    const estimatedCostSavedUsd = (estimatedTokensSaved * 0.0000002).toFixed(2);

    return NextResponse.json({
      ok: true,
      data: {
        items,
        metrics: {
          totalItems: items.length,
          approvedItems: items.filter((i) => i.status === "approved").length,
          draftItems: items.filter((i) => i.status === "draft").length,
          totalCacheHits,
          estimatedTokensSaved,
          estimatedCostSavedUsd,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
