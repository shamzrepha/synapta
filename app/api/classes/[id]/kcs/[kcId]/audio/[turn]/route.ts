import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { audioForStudents } from "@/lib/classes/live";
import { getAudioLesson, readClip, recordTurns, translatedClip } from "@/lib/lesson/audio";
import { getUserLanguage } from "@/lib/i18n/server";
import { classSourceLanguage } from "@/lib/i18n/serve";
import { isLanguageCode } from "@/lib/i18n/languages";
import { localizeJson } from "@/lib/i18n/translate";

export const runtime = "nodejs";
export const maxDuration = 90;

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
    const source = await classSourceLanguage(access.classData);
    const asked = req.nextUrl.searchParams.get("lang");
    const lang = access.canMutate ? (isLanguageCode(asked) ? asked : source) : await getUserLanguage(caller.uid);
    let clip = null as Awaited<ReturnType<typeof readClip>>;
    if (lang !== source) {
      // the teacher's line in the student's language, voiced once and saved for everyone in that language
      const text = (await localizeJson({ text: meta.turns[index].text }, lang)).text;
      clip = await translatedClip(classId, kcId, meta, index, text, lang).catch(() => null);
    }
    if (!clip) clip = await readClip(classId, kcId, meta.version, index);
    if (!clip && access.canMutate) {
      await recordTurns(classId, kcId, { ...meta, turns: meta.turns.map((t, i) => (i === index ? t : { ...t, hasAudio: true })) }, 50_000);
      clip = await readClip(classId, kcId, meta.version, index);
    }
    if (!clip) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "No audio" } }, { status: 404 });
    // A saved clip never changes for a given version (the player asks for ?v=<version>), so browsers keep it for
    // good, and Range requests (seeking, iOS Safari, resuming) get proper partial responses.
    const total = clip.audio.length;
    const headers: Record<string, string> = {
      "Content-Type": clip.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : total - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : total - 1;
      start = Math.max(0, start);
      end = Math.min(total - 1, end);
      if (start > end || start >= total) {
        return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } });
      }
      const part = clip.audio.subarray(start, end + 1);
      return new NextResponse(new Uint8Array(part), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(part.length) } });
    }
    return new NextResponse(new Uint8Array(clip.audio), { headers: { ...headers, "Content-Length": String(total) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
