import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { assertAiActive } from "@/lib/ai/guard";
import { audioKey, questionClip, spokenText } from "@/lib/practice/question-audio";
import { toCbtItem, toTheoryItem, type BankQuestion } from "@/lib/practice/sprint";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ classId: z.string().min(1).max(80).optional(), batch: z.number().int().min(1).max(10).default(6) });

/**
 * Admin: make the spoken clip for past questions ahead of time, a few per call (call again until `remaining` is 0).
 * Clips already stored are skipped, so it is safe to run again and costs nothing for questions that are done.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "qaudio-prerecord", limit: 40, windowMs: 60 * 60 * 1000, shared: true });
    if (limited) return limited;
    const { classId, batch } = await parseJson(req, body);
    await assertAiActive({ spend: true });

    const classIds = classId ? [classId] : (await adminDb().collection("classes").limit(200).get()).docs.map((d) => d.id);
    let made = 0;
    let have = 0;
    let remaining = 0;
    for (const cid of classIds) {
      const qs = await adminDb().collection("classes").doc(cid).collection("pastQuestions").limit(200).get();
      for (const d of qs.docs) {
        const q = { id: d.id, ...(d.data() as object) } as BankQuestion;
        for (const item of [toCbtItem(q), toTheoryItem(q)]) {
          if (!item) continue;
          const text = spokenText(item);
          const exists = (await adminDb().collection("questionAudio").doc(audioKey(text)).get()).exists;
          if (exists) {
            have++;
            continue;
          }
          if (made >= (batch ?? 6)) {
            remaining++;
            continue;
          }
          if (await questionClip(text)) made++;
        }
      }
    }
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "question_audio.prerecord", targetType: "config", targetId: classId || "all", details: { made, have, remaining } });
    return NextResponse.json({ ok: true, data: { made, alreadyDone: have, remaining } });
  } catch (error) {
    return handleAuthError(error);
  }
}
