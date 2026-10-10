import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ friendUid: string }> }
) {
  try {
    const caller = await requireUser(req);
    const { friendUid } = await params;

    const batch = adminDb().batch();
    const doc1 = adminDb().collection("users").doc(caller.uid).collection("friends").doc(friendUid);
    const doc2 = adminDb().collection("users").doc(friendUid).collection("friends").doc(caller.uid);

    batch.delete(doc1);
    batch.delete(doc2);

    await batch.commit();

    return NextResponse.json({
      ok: true,
      data: { message: "Friend removed." },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
