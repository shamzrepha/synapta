import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { generateGeminiVoice, generateFullDiscussionAudio } from "@/lib/ai/voice";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const singleTurnSchema = z.object({
  text: z.string().min(1).max(3000),
  speaker: z.string().default("Alex"),
});

const fullScriptSchema = z.object({
  dialogue: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
    })
  ).min(1).max(50),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    // Path 1: Full episode batch script audio synthesis
    const fullParsed = fullScriptSchema.safeParse(body);
    if (fullParsed.success) {
      await checkRateLimitAndQuota(caller.uid, 500);
      const batchResult = await generateFullDiscussionAudio(fullParsed.data.dialogue);

      return NextResponse.json({
        ok: true,
        data: {
          turns: batchResult.turns,
          totalGenerated: batchResult.turns.length,
          fallbackToBrowser: batchResult.turns.length === 0,
        },
      });
    }

    // Path 2: Single-turn audio synthesis
    const singleParsed = singleTurnSchema.safeParse(body);
    if (!singleParsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Invalid payload. Provide text & speaker or dialogue array." } },
        { status: 400 }
      );
    }

    await checkRateLimitAndQuota(caller.uid, 500);

    const result = await generateGeminiVoice({
      text: singleParsed.data.text,
      speaker: singleParsed.data.speaker,
    });

    if (!result) {
      return NextResponse.json({
        ok: true,
        data: {
          audioBase64: null,
          fallbackToBrowser: true,
          message: "Studio voice audio unavailable; using browser voice synthesis fallback.",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        voiceName: result.voiceName,
        fallbackToBrowser: false,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
