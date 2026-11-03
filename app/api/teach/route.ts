import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { extractJsonPayload, generateWithFallback } from "@/lib/ai/router";
import { lessonForStudents } from "@/lib/classes/live";
import { classSourceLanguage, localizeFor } from "@/lib/i18n/serve";
import { loadOwnNote, readVersions } from "@/lib/study/notes-store";
import { SCRIPT_SYSTEM, fallbackScript, parseScript, type LessonScript } from "@/lib/teach/script";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  source: z.discriminatedUnion("type", [z.object({ type: z.literal("kc"), classId: z.string().min(1), kcId: z.string().min(1) }), z.object({ type: z.literal("note"), id: z.string().min(1) })]),
  regenerate: z.boolean().optional(),
});

async function writeScript(title: string, material: string, userId: string, learnerLanguage: boolean): Promise<{ script: LessonScript; fromAi: boolean }> {
  const ask = async (extra = "") =>
    generateWithFallback({
      task: "structured_spec",
      systemInstruction: SCRIPT_SYSTEM,
      userPrompt: `Topic: ${title}\n\n--- NOTES ---\n${material.slice(0, 30_000)}\n--- END NOTES ---\n${extra}`,
      temperature: 0.4,
      userId,
      learnerLanguage,
    });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await ask(attempt ? "\nYour previous answer was not valid. Return ONLY the JSON object described, using only the listed block types." : "");
      const json = extractJsonPayload(r.text || "");
      const script = parseScript(json);
      if (script) return { script, fromAi: true };
    } catch {
      // try once more, then fall back to the notes themselves
    }
  }
  return { script: fallbackScript(title, material), fromAi: false };
}

/**
 * The interactive lesson for a class topic or for the learner's own notes. It is written once and saved; later opens are
 * free. A class lesson is stored in the class's language and shown to each learner in theirs.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "teach", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const { source, regenerate } = await parseJson(req, bodySchema);

    if (source.type === "note") {
      const { ref, data } = await loadOwnNote(source.id, caller.uid);
      if (data.teachScript && !regenerate) return NextResponse.json({ ok: true, data: { script: data.teachScript as LessonScript } });
      const versions = await readVersions(source.id);
      const notes = (versions.find((v) => v.n === data.head) ?? versions[0])?.markdown || "";
      if (!notes) throw new ApiError(404, "NOT_FOUND", "Notes not found");
      await checkRateLimitAndQuota(caller.uid, 7000);
      const { script } = await writeScript(String(data.title || "Lesson"), notes, caller.uid, true);
      await ref.update({ teachScript: script, teachAt: Timestamp.now() });
      return NextResponse.json({ ok: true, data: { script } });
    }

    const access = await assertClassAccess(caller, source.classId, "view");
    const ref = adminDb().collection("classes").doc(source.classId).collection("kcs").doc(source.kcId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
    const kc = snap.data()!;
    const lang = await classSourceLanguage(access.classData);
    let script = kc.teachScript as LessonScript | undefined;
    if (!script || (regenerate && access.canMutate)) {
      const lesson = access.canMutate ? String(kc.liveLessonMarkdown || kc.lessonMarkdown || "") : lessonForStudents(kc);
      const material = [kc.description, ...(Array.isArray(kc.objectives) ? kc.objectives : []), lesson].filter(Boolean).join("\n\n");
      if (!material.trim()) throw new ApiError(409, "NOT_READY", "This topic has no lesson yet.");
      await checkRateLimitAndQuota(caller.uid, 7000);
      ({ script } = await writeScript(String(kc.title || "Lesson"), material, caller.uid, false));
      await ref.set({ teachScript: script, teachAt: Timestamp.now() }, { merge: true });
    }
    // each learner gets the lesson in their own language (translated once, then stored)
    const shown = await localizeFor(req, caller, access.canMutate, script as LessonScript, lang);
    return NextResponse.json({ ok: true, data: { script: shown } });
  } catch (error) {
    return handleAuthError(error);
  }
}
