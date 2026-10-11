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
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "view");

    const snap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("mapProposals")
      .orderBy("createdAt", "desc")
      .get();

    const proposals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({
      ok: true,
      data: proposals,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
