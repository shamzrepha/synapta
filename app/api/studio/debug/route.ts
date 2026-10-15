import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { diagnosisSchema, normalizeDiagnosis, parseImageDataUrl } from "@/lib/studio/debug/schema";
import { cleanPartTypes, debugSystem, debugUserPrompt } from "@/lib/studio/debug/prompts";

export const runtime = "nodejs";
export const maxDuration = 90;

const COLLECTION = "circuitDebugs";

/** The student's past diagnoses (newest first). No photos are kept: only the question and the answer. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(200).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, symptom: x.symptom, setup: x.setup || "", parts: x.parts || [], diagnosis: x.diagnosis, createdAt: x.createdAt?.toDate?.().toISOString() || null };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 30);
    return NextResponse.json({ ok: true, data: { items } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  /** JPEG/PNG/WebP data URL, compressed in the browser */
  image: z.string().max(1_400_000),
  symptom: z.string().trim().min(4).max(800),
  setup: z.string().trim().max(800).default(""),
  parts: z.array(z.string().max(30)).max(12).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_debug", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const img = parseImageDataUrl(body.image);
    if (!img) throw new ApiError(400, "BAD_IMAGE", "Attach a JPEG, PNG or WebP photo (the app shrinks it for you).");
    const types = cleanPartTypes(body.parts);

    const res = await generateWithFallback({
      task: "studio_build",
      systemInstruction: debugSystem(types),
      contents: [{ role: "user", parts: [{ text: debugUserPrompt(body.symptom, body.setup ?? "", types) }, { inlineData: { mimeType: img.mimeType, data: img.data } }] }],
      schema: diagnosisSchema,
      temperature: 0.2,
      userId: caller.uid,
    });
    if (!res.data) throw new ApiError(502, "AI_EMPTY", "The AI didn't return a diagnosis. Try again.");
    const diagnosis = normalizeDiagnosis(res.data);

    const ref = adminDb().collection(COLLECTION).doc();
    const now = Timestamp.now();
    await ref.set({ uid: caller.uid, symptom: body.symptom, setup: body.setup ?? "", parts: types, diagnosis, createdAt: now });
    return NextResponse.json({ ok: true, data: { id: ref.id, diagnosis, createdAt: now.toDate().toISOString() } });
  } catch (error) {
    return handleAuthError(error);
  }
}
