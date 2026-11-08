import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { questRef, runRef, MAX_QUEST_PIECES, type StoredQuest, type QuestRun } from "@/lib/quest/store";
import { answerSchema, gradeChallenge, solutionText } from "@/lib/quest/schema";
import { z } from "zod";

export const runtime = "nodejs";

const checkSchema = z.object({
  index: z.number().int().min(0).max(MAX_QUEST_PIECES - 1),
  challengeId: z.string().min(1).max(20),
  answer: answerSchema,
});

/** Grades one challenge on the server and remembers whether it was right on the first try. The answer never reaches the browser unless the learner missed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const { index, challengeId, answer } = await parseJson(req, checkSchema);
    const kc = (await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get()).data() || {};
    if (!access.canMutate && !isPublished(kc, "simulation")) throw new ApiError(403, "NOT_PUBLISHED", "These challenges aren't published yet.");
    const snap = await questRef(classId, kcId, index).get();
    const quest = snap.exists ? (snap.data() as StoredQuest) : null;
    const challenge = quest?.challenges?.find((c) => c.id === challengeId);
    if (!quest || !challenge) throw new ApiError(404, "NO_CHALLENGE", "That challenge no longer exists. Reload the page.");

    const correct = gradeChallenge(challenge, answer);

    if (access.isEnrolled) {
      const ref = runRef(caller.uid, classId, kcId, index);
      await adminDb().runTransaction(async (t) => {
        const cur = await t.get(ref);
        const run: QuestRun = cur.exists ? (cur.data() as QuestRun) : { uid: caller.uid, firstTry: {}, solved: {} };
        if (run.creditedVersion === quest.version) return; // already credited: replays earn nothing more
        if (!(challengeId in run.firstTry)) run.firstTry[challengeId] = correct;
        if (correct) run.solved[challengeId] = true;
        t.set(ref, run);
      });
    }

    return NextResponse.json({
      ok: true,
      data: { correct, explanation: challenge.explanation, ...(correct ? {} : { hint: challenge.hint, solution: solutionText(challenge) }) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
