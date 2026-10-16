import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { audioForStudents } from "@/lib/classes/live";
import { getAudioLesson, readClip, recordTurns } from "@/lib/lesson/audio";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Streams one saved clip of the podcast. Students are served the version the teacher pushed, straight from
 * the saved file (no AI, no TTS). Only a teacher can trigger recording a missing clip.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string; turn: string }> }) {
  try {
    const { id: classId, kcId, turn } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const index = Number(turn);
    if (!Number.isInteger(index) || index < 0 || index > 50) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Bad turn" } }, { status: 400 });
    }
    const kc = (await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get()).data() || {};
    const meta = access.canMutate ? await getAudioLesson(classId, kcId) : await audioForStudents(classId, kcId, kc);
    if (!meta || !meta.turns[index]) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "No audio" } }, { status: 404 });
    let clip = await readClip(classId, kcId, meta.version, index);
    if (!clip && access.canMutate) {
      await recordTurns(classId, kcId, { ...meta, turns: meta.turns.map((t, i) => (i === index ? t : { ...t, hasAudio: true })) }, 50_000);
      clip = await readClip(classId, kcId, meta.version, index);
    }
    if (!clip) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "No audio" } }, { status: 404 });
    return new NextResponse(new Uint8Array(clip.audio), {
      headers: {
        "Content-Type": clip.mimeType,
        "Content-Length": String(clip.audio.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
