import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const { id, mid } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const materialRef = adminDb()
      .collection("classes")
      .doc(id)
      .collection("materials")
      .doc(mid);

    const doc = await materialRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Material not found" } },
        { status: 404 }
      );
    }

    await materialRef.delete();

    // Detach from any KCs referencing this material
    const kcsSnap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("kcs")
      .where("sourceMaterialIds", "array-contains", mid)
      .get();

    const batch = adminDb().batch();
    for (const kcDoc of kcsSnap.docs) {
      const data = kcDoc.data();
      const updatedMaterials = ((data.sourceMaterialIds as string[]) || []).filter((m) => m !== mid);
      batch.update(kcDoc.ref, { sourceMaterialIds: updatedMaterials });
    }
    await batch.commit();

    return NextResponse.json({
      ok: true,
      data: { deleted: true, materialId: mid },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
