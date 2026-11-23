import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { assertAiActive } from "@/lib/ai/guard";
import { questionClip, spokenText, audioKey } from "@/lib/practice/question-audio";
import { toCbtItem, toTheoryItem, type BankQuestion } from "@/lib/practice/sprint";

export const runtime = "nodejs";
export const maxDuration = 30;

const body = z.object({ classId: z.string().min(1).max(80), questionId: z.string().min(1).max(120), kind: z.enum(["cbt", "theory"]) });

/**
 * The spoken version of one past question. The words come from the stored question (never from the request), so this cannot
 * be used to turn arbitrary text into speech, and the clip is made once and reused for everyone.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "qaudio", limit: 60, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const { classId, questionId, kind } = await parseJson(req, body);
    await assertClassAccess(caller, classId, "view");
    const snap = await adminDb().collection("classes").doc(classId).collection("pastQuestions").doc(questionId).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Question not found");
    const q = { id: snap.id, ...(snap.data() as object) } as BankQuestion;
    const item = kind === "cbt" ? toCbtItem(q) : toTheoryItem(q);
    if (!item) throw new ApiError(400, "NOT_SPEAKABLE", "This question can't be read aloud.");
    const text = spokenText(item);
    // only a clip that has to be made costs money, so only then is the spend switch checked
    const existing = await adminDb().collection("questionAudio").doc(audioKey(text)).get();
    if (!existing.exists) await assertAiActive({ spend: true });
    const clip = await questionClip(text);
    if (!clip) return NextResponse.json({ ok: false, error: { code: "TTS_UNAVAILABLE", message: "The voice is busy right now. You can read the question instead." } }, { status: 503 });
    return new NextResponse(new Uint8Array(clip.audio), {
      headers: { "Content-Type": clip.mimeType, "Content-Length": String(clip.audio.length), "Cache-Control": "private, max-age=86400", "X-Audio-Cache": clip.cached ? "hit" : "miss" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
