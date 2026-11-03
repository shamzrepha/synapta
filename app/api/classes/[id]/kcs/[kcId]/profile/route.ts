import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { CLASSIFY_SYSTEM, NEED_KEYS, STUDY_MODES, classifySchema, guessMode, profileFor, type NeedKey, type StudyMode } from "@/lib/study/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z
  .object({
    mode: z.enum(STUDY_MODES).optional(),
    needs: z.object(Object.fromEntries(NEED_KEYS.map((k) => [k, z.boolean().optional()])) as Record<NeedKey, z.ZodOptional<z.ZodBoolean>>).optional(),
  })
  .default({});

/**
 * Decides what this topic needs. With no body, AI classifies the topic (and falls back to a keyword guess if the AI is
 * unavailable). With a mode and/or needs, the teacher's choice is saved as is.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const access = await assertClassAccess(caller, id, "mutate");
    const raw = await req.text();
    let json: unknown = {};
    if (raw.trim()) {
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ApiError(400, "BAD_JSON", "Malformed JSON request body");
      }
    }
    const parsedBody = bodySchema.safeParse(json);
    if (!parsedBody.success) throw new ApiError(400, "VALIDATION", "Invalid topic settings");
    const body = parsedBody.data;

    const ref = adminDb().collection("classes").doc(id).collection("kcs").doc(kcId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Topic not found" } }, { status: 404 });
    const kc = snap.data()!;
    const subject = String(access.classData?.subject || "");

    let profile;
    if (body.mode || body.needs) {
      const mode: StudyMode = body.mode ?? (kc.studyProfile?.mode as StudyMode) ?? guessMode(`${kc.title} ${kc.description}`);
      profile = profileFor(mode, String(kc.studyProfile?.subject || subject), "teacher");
      if (!body.mode && kc.studyProfile?.needs) profile.needs = { ...profile.needs, ...kc.studyProfile.needs };
      if (body.needs) profile.needs = { ...profile.needs, ...Object.fromEntries(Object.entries(body.needs).filter(([, v]) => typeof v === "boolean")) };
      profile.needs.tutor = true;
    } else {
      let mode = guessMode(`${kc.title} ${kc.description} ${subject}`);
      let label = subject;
      let source: "ai" | "guess" = "guess";
      try {
        await checkRateLimitAndQuota(caller.uid, 800);
        const r = await generateWithFallback({
          task: "structured_spec",
          systemInstruction: CLASSIFY_SYSTEM,
          userPrompt: `Class subject: ${subject || "unknown"}\nTopic: ${kc.title}\nDescription: ${kc.description || ""}\nObjectives: ${(Array.isArray(kc.objectives) ? kc.objectives : []).slice(0, 6).join("; ")}`,
          schema: classifySchema,
          temperature: 0,
          userId: caller.uid,
          learnerLanguage: false,
        });
        if (r.data) {
          mode = r.data.mode;
          label = r.data.subject;
          source = "ai";
        }
      } catch {
        // the keyword guess still gives a sensible topic
      }
      profile = profileFor(mode, label, source);
    }

    await ref.set({ studyProfile: profile, updatedAt: Timestamp.now() }, { merge: true });
    return NextResponse.json({ ok: true, data: { profile } });
  } catch (error) {
    return handleAuthError(error);
  }
}
