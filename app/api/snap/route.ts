import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { adminDb } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { parseImageDataUrl, deriveSnapTitle } from "@/lib/snap/image";
import { snapSystem } from "@/lib/snap/prompts";
import { wrapUserInput } from "@/lib/study/topic-source";
import { EXPLAIN_LEVELS, levelInstruction } from "@/lib/study/explain-level";

export const runtime = "nodejs";
export const maxDuration = 60;

const COLLECTION = "snapHistory";

const bodySchema = z.object({
  imageDataUrl: z.string().max(4_200_000),
  guided: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
  level: z.enum(EXPLAIN_LEVELS).optional(),
});

/** Photo in, step-by-step explanation out. The image is sent to the model and never stored. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "snap", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const { imageDataUrl, guided: guidedRaw, note, level } = await parseJson(req, bodySchema);
    const guided = Boolean(guidedRaw);
    const image = parseImageDataUrl(imageDataUrl);
    if (!image) throw new ApiError(400, "BAD_IMAGE", "Please upload a JPEG, PNG or WebP photo under 2 MB.");

    await checkRateLimitAndQuota(caller.uid, 2500);
    const prompt = note ? `Student's note about the problem:\n${wrapUserInput(note)}` : "Explain the problem in the image.";
    const result = await generateWithFallback({
      task: "tutor_chat",
      systemInstruction: snapSystem(guided) + levelInstruction(level),
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: prompt }] }],
      temperature: 0.3,
      userId: caller.uid,
    });
    const text = (result.text || "").trim();
    if (!text) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't read that photo. Try a clearer one.");

    const title = deriveSnapTitle(text);
    const createdAt = new Date().toISOString();
    const ref = await adminDb().collection(COLLECTION).add({ uid: caller.uid, title, text, guided, note: note || "", createdAt });
    return NextResponse.json({ ok: true, data: { id: ref.id, title, text, guided, createdAt } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Past snaps (text only), newest first. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(200).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          title: String(x.title || "Homework problem"),
          text: String(x.text || ""),
          guided: Boolean(x.guided),
          createdAt: String(x.createdAt || ""),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
    return NextResponse.json({ ok: true, data: items });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) throw new ApiError(400, "VALIDATION", "id required");
    const ref = adminDb().collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.uid !== caller.uid) throw new ApiError(404, "NOT_FOUND", "Not found");
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
