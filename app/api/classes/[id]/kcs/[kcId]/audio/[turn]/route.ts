import { NextRequest, NextResponse, after } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { audioForStudents } from "@/lib/classes/live";
import { getAudioLesson, readClip, recordTurns, translatedClip } from "@/lib/lesson/audio";
import { getUserLanguage } from "@/lib/i18n/server";
import { classSourceLanguage } from "@/lib/i18n/serve";
import { isLanguageCode } from "@/lib/i18n/languages";
import { translateOne } from "@/lib/i18n/translate";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 300;

/** How long a listener waits for a line in their language before the original plays (recording carries on). */
const LISTEN_DEADLINE_MS = 45_000;

/**
 * Streams one saved clip of the podcast. Students are served the version the teacher pushed, straight from
 * the saved file (no AI, no TTS). Only a teacher can trigger recording a missing clip. A listener in another
 * language gets the line translated and voiced once (saved for everyone in that language); if that isn't possible
 * right now, the original recording plays and is retried on the next play.
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
    // re-recording a language spends voice quota, so only the class's teachers can ask for it
    const rerecord = access.canMutate && req.nextUrl.searchParams.get("rerecord") === "1";
    if (rerecord) {
      const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "audio_rerecord", limit: 120, windowMs: 10 * 60_000 });
      if (limited) return limited;
    }
    let clip = null as Awaited<ReturnType<typeof readClip>>;
    let fallback = false;
    if (lang !== source) {
      // the teacher's line in the listener's language, voiced once and saved for everyone in that language
      let text: string | null = null;
      const work = (async () => {
        text = await translateOne(lang, meta.turns[index].text);
        return text ? await translatedClip(classId, kcId, meta, index, text, lang, rerecord).catch(() => null) : null;
      })();
      if (rerecord) {
        clip = await work;
      } else {
        // a slow translation or voice (Gemini speaks Igbo and Hausa, slower than the free voice) must not make the
        // line fail: past the deadline the original plays now, and the recording finishes in the background so the
        // next play is in the listener's language
        const late = Symbol("late");
        const first = await Promise.race([work, new Promise<typeof late>((r) => setTimeout(() => r(late), LISTEN_DEADLINE_MS))]);
        if (first === late) after(() => work.then(() => undefined));
        else clip = first;
      }
      if (!clip) {
        // a teacher re-recording needs to know the line failed
        if (rerecord) {
          return NextResponse.json(
            { ok: false, error: { code: text ? "TTS_BUSY" : "TRANSLATION_BUSY", message: "This line couldn't be voiced in that language right now. Try again shortly." } },
            { status: 503, headers: { "Cache-Control": "no-store" } }
          );
        }
        // the translation or the voice is unavailable right now: play the teacher's own recording instead of
        // silence, and never let the browser keep it, so the next play tries the listener's language again
        clip = await readClip(classId, kcId, meta.version, index);
        fallback = true;
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
      "Cache-Control": fallback || rerecord ? "no-store" : "private, max-age=31536000, immutable",
      "X-Audio-Language": fallback ? source : lang,
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
