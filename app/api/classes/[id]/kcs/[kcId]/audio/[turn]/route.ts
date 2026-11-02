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
    const asked = req.nextUrl.searchParams.get("lang") || req.nextUrl.searchParams.get("l");
    const lang = isLanguageCode(asked) ? asked : access.canMutate ? source : await getUserLanguage(caller.uid);
    const forceRerecord = req.nextUrl.searchParams.get("rerecord") === "1";
    let clip = null as Awaited<ReturnType<typeof readClip>>;
    if (lang !== source) {
      // the teacher's line in the student's language, voiced once and saved for everyone in that language
      const srcText = meta.turns[index].text;
      let text = (await localizeJson({ text: srcText }, lang)).text;
      // If the first translation attempt failed and returned the English string unchanged, try once more before voicing
      if (text.trim() === srcText.trim() && srcText.trim().length > 8) {
        text = (await localizeJson({ text: srcText }, lang)).text;
      }
      if (text.trim() === srcText.trim() && srcText.trim().length > 8) {
        return NextResponse.json(
          { ok: false, error: { code: "TRANSLATION_BUSY", message: "Translating this line into your language… retrying shortly." } },
          { status: 503, headers: { "Cache-Control": "no-store" } }
        );
      }
      clip = await translatedClip(classId, kcId, meta, index, text, lang, forceRerecord).catch(() => null);
      if (!clip) {
        return NextResponse.json(
          { ok: false, error: { code: "TTS_BUSY", message: "Recording this line in your language… retrying shortly." } },
          { status: 503, headers: { "Cache-Control": "no-store" } }
        );
      }
    } else {
      clip = await readClip(classId, kcId, meta.version, index);
      if (!clip && access.canMutate) {
        await recordTurns(classId, kcId, { ...meta, turns: meta.turns.map((t, i) => (i === index ? t : { ...t, hasAudio: true })) }, 50_000);
        clip = await readClip(classId, kcId, meta.version, index);
      }
    }
    if (!clip) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "No audio" } }, { status: 404, headers: { "Cache-Control": "no-store" } });
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
