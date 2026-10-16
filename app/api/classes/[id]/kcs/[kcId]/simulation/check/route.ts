import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { applyEvidence } from "@/lib/evidence/apply";
import { getStoredSimulation } from "@/lib/sim/store";
import { adminDb } from "@/lib/firebase/admin";
import { simulationForStudents } from "@/lib/classes/live";
import { z } from "zod";

export const runtime = "nodejs";

const checkSchema = z.object({
  selectedOptionIndex: z.number().int().min(0).max(5),
});

/**
 * Grades the simulation's "check your understanding" question on the server. This is what earns
 * lab mastery credit; the iframe's own "goal complete" signal is never trusted for XP.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const { selectedOptionIndex } = await parseJson(req, checkSchema);

    // Students are graded against the version they were shown (the pushed one)
    const kc = (await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get()).data() || {};
    const sim = access.canMutate ? await getStoredSimulation(classId, kcId) : await simulationForStudents(classId, kcId, kc);
    const q = sim?.checkQuestion;
    if (!q) {
      throw new ApiError(404, "NO_CHECK", "This simulation has no check question.");
    }

    const correct = selectedOptionIndex === q.correctIndex;

    // Teachers previewing their own class get feedback without touching mastery data
    let evidence: Awaited<ReturnType<typeof applyEvidence>> | null = null;
    if (access.isEnrolled) {
      evidence = await applyEvidence({
        uid: caller.uid,
        classId,
        kcId,
        activity: "lab",
        correct,
        metadata: { source: "ai_simulation", simVersion: sim?.version ?? 0, selectedOptionIndex },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        correct,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        ...(evidence || {}),
        credited: !!evidence,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
