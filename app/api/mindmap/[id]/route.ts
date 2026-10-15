import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const ref = adminDb().collection("mindMaps").doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.uid !== caller.uid) throw new ApiError(404, "NOT_FOUND", "Not found");
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
