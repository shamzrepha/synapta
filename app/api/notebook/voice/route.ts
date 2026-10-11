import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { generateGeminiVoice } from "@/lib/ai/voice";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { z } from "zod";

export const runtime = "nodejs";

const voiceRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  speaker: z.string().default("Alex"),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = voiceRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid payload" } },
        { status: 400 }
      );
    }

    await checkRateLimitAndQuota(caller.uid, 500);

    const result = await generateGeminiVoice({
      text: parsed.data.text,
      speaker: parsed.data.speaker,
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
