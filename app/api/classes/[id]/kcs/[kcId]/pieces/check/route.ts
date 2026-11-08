import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { applyEvidence } from "@/lib/evidence/apply";
import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { pieceRef, MAX_PIECES, type StoredPiece } from "@/lib/sim/pieces";
import { z } from "zod";

export const runtime = "nodejs";

const checkSchema = z.object({
  index: z.number().int().min(0).max(MAX_PIECES - 1),
  selectedOptionIndex: z.number().int().min(0).max(5),
});

/** Grades a piece lab's check question on the server; the answer key never reaches the browser. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const { index, selectedOptionIndex } = await parseJson(req, checkSchema);
    const kc = (await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get()).data() || {};
    if (!access.canMutate && !isPublished(kc, "simulation")) {
      throw new ApiError(403, "NOT_PUBLISHED", "This lab isn't published yet.");
    }
    const snap = await pieceRef(classId, kcId, index).get();
    const q = snap.exists ? (snap.data() as StoredPiece).checkQuestion : null;
    if (!q) throw new ApiError(404, "NO_CHECK", "This lab has no check question.");
    const correct = selectedOptionIndex === q.correctIndex;
    const evidence = access.isEnrolled
      ? await applyEvidence({ uid: caller.uid, classId, kcId, activity: "lab", correct, metadata: { source: "piece_lab", piece: index, selectedOptionIndex } })
      : null;
    return NextResponse.json({
      ok: true,
      data: { correct, correctIndex: q.correctIndex, explanation: q.explanation, ...(evidence || {}), credited: !!evidence },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
