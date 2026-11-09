import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { AiChainExhaustedError, AiRouteMissingError } from "@/lib/ai/structured/types";
import { canPlay } from "@/lib/worlds/play";
import { loadLibrary } from "@/lib/worlds/store";
import { askTutor, TUTOR_MODES } from "@/lib/worlds/tutor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Ask about my notes: answers come from her own facts, with the notes they came from; anything else is labelled. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: user.uid, keyPrefix: "worlds-tutor", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { ok } = await canPlay(user.uid, worldId);
    if (!ok) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
    const { question, mode } = await parseJson(req, z.object({ question: z.string().trim().min(2).max(600), mode: z.enum(TUTOR_MODES).default("simple") }));
    const lib = await loadLibrary(worldId);
    try {
      return NextResponse.json({ ok: true, data: await askTutor(question, mode ?? "simple", Object.values(lib.units)) });
    } catch (e) {
      if (e instanceof AiRouteMissingError || e instanceof AiChainExhaustedError) throw new ApiError(503, "AI_NOT_READY", "The tutor isn't available right now. Please try again in a moment.");
      throw e;
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
