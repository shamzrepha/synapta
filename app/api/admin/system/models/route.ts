import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getModelsHealthReport, markModelExhausted, markModelInvalid, recordModelUsage } from "@/lib/ai/health";
import { getGeminiClient } from "@/lib/gemini/client";
import { classifyProviderError } from "@/lib/ai/router";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const report = await getModelsHealthReport();
    return NextResponse.json({ ok: true, data: { models: report } });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const body = await req.json().catch(() => ({}));
    const model = typeof body.model === "string" ? body.model.trim() : "";

    if (!model) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_ARGUMENT", message: "Model ID is required" } },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    try {
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model,
        contents: "Respond with exactly the single word: OK",
      });

      const latencyMs = Date.now() - startTime;
      const rawText = response.text;
      const text = typeof rawText === "string" ? rawText : "";
      const usage = response.usageMetadata;
      const inTokens = usage?.promptTokenCount || 5;
      const outTokens = usage?.candidatesTokenCount || 2;

      await recordModelUsage(model, inTokens, outTokens);

      return NextResponse.json({
        ok: true,
        data: {
          model,
          success: true,
          status: "ok",
          latencyMs,
          text: text.trim(),
        },
      });
    } catch (testErr) {
      const latencyMs = Date.now() - startTime;
      const classified = classifyProviderError(testErr);

      if (classified.type === "daily_exhaustion") {
        await markModelExhausted(model, classified.retryDelaySeconds);
      } else if (classified.type === "invalid_model") {
        await markModelInvalid(model);
      }

      return NextResponse.json({
        ok: true,
        data: {
          model,
          success: false,
          status: classified.type === "daily_exhaustion" ? "exhausted" : "error",
          errorType: classified.type,
          errorMessage: classified.message,
          latencyMs,
        },
      });
    }
  } catch (err) {
    return handleAuthError(err);
  }
}
