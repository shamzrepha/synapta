import { NextRequest, NextResponse, after } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { audioForStudents } from "@/lib/classes/live";
import { MAX_LINE_FAILS, getAudioLesson, languageFailures, prepareLanguage, readClip, recordTurns, translatedClip } from "@/lib/lesson/audio";
import { getUserLanguage } from "@/lib/i18n/server";
import { classSourceLanguage } from "@/lib/i18n/serve";
import { isLanguageCode } from "@/lib/i18n/languages";
import { cachedTranslation, translateOne, translateTexts } from "@/lib/i18n/translate";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Streams one saved clip of the podcast. Students are served the version the teacher pushed, straight from
 * the saved file (no AI, no TTS). A listener in another language gets saved clips in that language; if the
 * requested line is not recorded yet, we translate and voice that line immediately inline so playback starts
 * right away, while also warming up the rest of the podcast in the background.
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
    if (lang !== source) {
      // the teacher's line in the listener's language, voiced once and saved for everyone in that language
      const srcText = meta.turns[index].text;
      if (rerecord) {
        const text = await translateOne(lang, srcText);
        clip = text ? await translatedClip(classId, kcId, meta, index, text, lang, true).catch(() => null) : null;
        if (!clip) {
          return NextResponse.json(
            { ok: false, error: { code: text ? "TTS_BUSY" : "TRANSLATION_BUSY", message: "This line couldn't be voiced in that language right now. Try again shortly." } },
            { status: 503, headers: { "Cache-Control": "no-store" } }
          );
        }
      } else {
        // Lines are recorded by one background job per language (started when the podcast opens, see the audio
        // route), in order, two at a time. Recording the same line here too would spend the voice allowance twice.
        const text = await cachedTranslation(lang, srcText);
        const saved = text ? await readClip(classId, kcId, meta.version, index, lang, text) : null;
        if (!saved) {
          // record the rest of the podcast in this language in the background, starting with this line
          after(() => prepareLanguage(classId, kcId, meta, lang, (texts) => translateTexts(lang, texts), index).catch(() => undefined));
        }
        if (saved) {
          clip = saved;
        } else {
          const fails = (await languageFailures(classId, kcId, meta.version, lang).catch(() => ({} as Record<string, number>)))[index] ?? 0;
          if (fails < MAX_LINE_FAILS) {
            // not recorded yet: the player waits on this line (and plays the ones that are ready) and asks again
            return NextResponse.json(
              { ok: true, data: { preparing: true } },
              { status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "3" } }
            );
          }
          // this line keeps failing right now (usually a busy or used-up AI allowance): say so instead of playing
          // English. The player keeps asking, and the line is tried again automatically a couple of minutes later.
          return NextResponse.json(
            { ok: false, error: { code: "LANG_AUDIO_UNAVAILABLE", message: "This line couldn't be recorded in your language yet. It will be tried again in a few minutes." } },
            { status: 503, headers: { "Cache-Control": "no-store" } }
          );
        }
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
      "Cache-Control": rerecord ? "no-store" : "private, max-age=31536000, immutable",
      "X-Audio-Language": lang,
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
