import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { applyEvidenceIfEnrolled } from "@/lib/evidence/apply";
import { questRef, runRef, MAX_QUEST_PIECES, type StoredQuest, type QuestRun } from "@/lib/quest/store";
import { z } from "zod";

export const runtime = "nodejs";

const completeSchema = z.object({ index: z.number().int().min(0).max(MAX_QUEST_PIECES - 1) });

/** Finishing a quest earns mastery credit once, computed from what the server recorded (not from anything the browser claims). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const { index } = await parseJson(req, completeSchema);
    const quest = (await questRef(classId, kcId, index).get()).data() as StoredQuest | undefined;
    if (!quest?.challenges?.length) throw new ApiError(404, "NO_QUEST", "There is no quest for this piece.");
    const total = quest.challenges.length;

    if (!access.isEnrolled) return NextResponse.json({ ok: true, data: { credited: false, firstTry: 0, total } });

    const ref = runRef(caller.uid, classId, kcId, index);
    const run = ((await ref.get()).data() as QuestRun | undefined) || { uid: caller.uid, firstTry: {}, solved: {} };
    if (run.creditedVersion === quest.version) return NextResponse.json({ ok: true, data: { credited: false, alreadyCredited: true, firstTry: 0, total } });
    const allSolved = quest.challenges.every((c) => run.solved[c.id]);
    if (!allSolved) throw new ApiError(409, "QUEST_UNFINISHED", "Finish every challenge first.");
    const firstTry = quest.challenges.filter((c) => run.firstTry[c.id]).length;

    let evidence: Awaited<ReturnType<typeof applyEvidenceIfEnrolled>> | null = null;
    try {
      evidence = await applyEvidenceIfEnrolled({ uid: caller.uid, classId, kcId, activity: "lab", correct: firstTry / total >= 0.6, metadata: { source: "quest", piece: index, firstTry, total } });
    } catch (e) {
      // the once-per-10-minutes lab limit: they still finished, they just don't earn a second credit yet
      if (!(e instanceof ApiError && e.code === "LAB_RATE_LIMITED")) throw e;
    }
    if (evidence) await adminDb().runTransaction(async (t) => t.set(ref, { ...run, creditedVersion: quest.version }, { merge: true }));
    return NextResponse.json({ ok: true, data: { credited: !!evidence, firstTry, total, ...(evidence || {}) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
