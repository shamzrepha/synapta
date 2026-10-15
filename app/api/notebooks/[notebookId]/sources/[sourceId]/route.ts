import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { FieldValue } from "@/lib/firebase/admin";
import { loadNotebook, touch } from "@/lib/notebooks/store";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ notebookId: string; sourceId: string }> }) {
  try {
    const { notebookId, sourceId } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadNotebook(notebookId, caller.uid, "editor");
    const s = await ref.collection("sources").doc(sourceId).get();
    if (s.exists) {
      await s.ref.delete();
      await touch(notebookId, { sourceCount: FieldValue.increment(-1) });
    }
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
