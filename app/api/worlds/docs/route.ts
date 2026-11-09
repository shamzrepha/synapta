import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { AiChainExhaustedError, AiRouteMissingError } from "@/lib/ai/structured/types";
import { ingestDocument, MAX_IMAGES, MAX_TEXT_CHARS } from "@/lib/worlds/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(["docx", "pdf", "image", "text"]),
    classId: z.string().min(1).max(128).optional(),
    pageTexts: z.array(z.string().max(MAX_TEXT_CHARS)).max(400).optional(),
    images: z.array(z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().max(4_500_000) })).max(MAX_IMAGES).optional(),
  })
  .refine((b) => (b.pageTexts?.some((t) => t.trim().length > 0) ?? false) || (b.images?.length ?? 0) > 0, { message: "Add some text or at least one photo." });

/** Stores one uploaded note (cleaned, with unclear lines flagged). Private to the uploader (R8). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: user.uid, keyPrefix: "worlds-docs", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const b = await parseJson(req, body);
    const total = (b.pageTexts ?? []).reduce((n, t) => n + t.length, 0);
    if (total > MAX_TEXT_CHARS) throw new ApiError(413, "TOO_LARGE", "This note is very long. Please upload it in parts.");
    try {
      const r = await ingestDocument({ ownerUid: user.uid, classId: b.classId, title: b.title, kind: b.kind, pageTexts: b.pageTexts, images: b.images });
      return NextResponse.json({ ok: true, data: r });
    } catch (e) {
      if (e instanceof AiRouteMissingError || e instanceof AiChainExhaustedError) {
        throw new ApiError(503, "AI_NOT_READY", "Reading photos isn't set up yet. Ask the admin to finish Worlds AI setup (Admin, System tab).");
      }
      throw e;
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
