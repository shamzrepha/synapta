import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { generateWithFallback } from "@/lib/ai/router";
import { parseImageDataUrl } from "@/lib/snap/image";
import { READ_SYSTEM, VISION_BATCH, cleanVisionText, splitVisionAnswer } from "@/lib/documents/pages";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  images: z.array(z.string().max(4_200_000)).min(1).max(VISION_BATCH),
});

/**
 * Reads pages that have no text layer (scans, photos of notes, handwriting). The browser renders the pages to images and
 * sends a few at a time; the images are sent to the model and never stored. Returns one text per image, in order.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "doc_read", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const { images } = await parseJson(req, schema);
    const parsed = images.map((i) => parseImageDataUrl(i));
    if (parsed.some((p) => !p)) throw new ApiError(400, "BAD_IMAGE", "Please use JPEG, PNG or WebP pages under 2 MB each.");

    await checkRateLimitAndQuota(caller.uid, 3000 * images.length);
    const result = await generateWithFallback({
      task: "long_document",
      systemInstruction: READ_SYSTEM,
      contents: [
        {
          role: "user",
          parts: [
            ...parsed.map((p) => ({ inlineData: { mimeType: p!.mimeType, data: p!.data } })),
            { text: `Transcribe these ${images.length} image(s) in order.` },
          ],
        },
      ],
      temperature: 0.1,
      userId: caller.uid,
      learnerLanguage: false,
    });
    const pages = splitVisionAnswer(result.text || "", images.length).map(cleanVisionText);
    if (pages.every((p) => !p) && !(result.text || "").trim()) {
      throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't read those pages. Try clearer photos.");
    }
    return NextResponse.json({ ok: true, data: { pages } });
  } catch (error) {
    return handleAuthError(error);
  }
}
