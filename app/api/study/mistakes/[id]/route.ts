import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { afterRetest } from "@/lib/mistakes/logic";
import { z } from "zod";

export const runtime = "nodejs";

async function loadOwn(id: string, uid: string) {
  const ref = adminDb().collection("mistakes").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid) throw new ApiError(404, "NOT_FOUND", "Mistake not found");
  return { ref, data: snap.data()! };
}

const retestSchema = z.object({ selectedIndex: z.number().int().min(0).max(20) });

/** Re-ask a saved mistake: POST { selectedIndex } -> whether it was right (2 right in a row masters it). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const { selectedIndex } = await parseJson(req, retestSchema);
    const { ref, data } = await loadOwn(id, caller.uid);
    const correct = selectedIndex === data.correctIndex;
    const next = afterRetest(
      { wrongCount: data.wrongCount || 1, retestCorrect: data.retestCorrect || 0, mastered: !!data.mastered },
      correct
    );
    await ref.update({ ...next, updatedAt: new Date().toISOString() });
    return NextResponse.json({
      ok: true,
      data: { correct, correctIndex: data.correctIndex, explanation: data.explanation || "", mastered: next.mastered, retestCorrect: next.retestCorrect },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const { ref } = await loadOwn(id, caller.uid);
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
