import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import {
  getModelsHealthReport,
  markModelExhausted,
  markModelInvalid,
  recordModelUsage,
  clearModelExhausted,
  clearAllModelExhaustion,
} from "@/lib/ai/health";
import {
  classifyProviderError,
  getDynamicModelConfig,
  setCachedDynamicModels,
  testSingleModel,
} from "@/lib/ai/router";
import { DEFAULT_MODEL_CONFIG, KNOWN_MODELS, sanitizeModelId } from "@/lib/ai/models";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { z } from "zod";

export const runtime = "nodejs";

const assignmentsSchema = z.object({
  assignments: z.record(z.string(), z.string()),
});

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const [report, dynamicAssignments] = await Promise.all([
      getModelsHealthReport(),
      getDynamicModelConfig(),
    ]);

    const activeAssignments = {
      tutor_chat: dynamicAssignments.tutor_chat || process.env.GEMINI_MODEL_TUTOR || DEFAULT_MODEL_CONFIG.tutor,
      structured_spec: dynamicAssignments.structured_spec || process.env.GEMINI_MODEL_STRUCTURED || DEFAULT_MODEL_CONFIG.structured,
      class_build: dynamicAssignments.class_build || process.env.GEMINI_MODEL_BUILD || DEFAULT_MODEL_CONFIG.build,
      grading_high_stakes: dynamicAssignments.grading_high_stakes || process.env.GEMINI_MODEL_GRADING || DEFAULT_MODEL_CONFIG.grading,
      long_document: dynamicAssignments.long_document || process.env.GEMINI_MODEL_LONGDOC || DEFAULT_MODEL_CONFIG.longdoc,
      voice: dynamicAssignments.voice || process.env.GEMINI_MODEL_VOICE || DEFAULT_MODEL_CONFIG.voice,
    };

    return NextResponse.json({
      ok: true,
      data: {
        models: report,
        assignments: activeAssignments,
        catalog: Object.values(KNOWN_MODELS).map((m) => ({
          id: m.id,
          tier: m.tier,
          rpd: m.rpd,
          notes: m.notes,
        })),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["admin"]);
    const body = await req.json().catch(() => ({}));
    const parsed = assignmentsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION", "Invalid assignments payload");
    }

    const cleanAssignments: Record<string, string> = {};
    for (const [task, modelId] of Object.entries(parsed.data.assignments)) {
      if (typeof modelId === "string" && modelId.trim()) {
        cleanAssignments[task] = sanitizeModelId(modelId.trim());
      }
    }

    const docRef = adminDb().collection("systemConfig").doc("aiModels");
    await docRef.set(
      {
        ...cleanAssignments,
        updatedAt: Timestamp.now(),
        updatedBy: caller.uid,
      },
      { merge: true }
    );

    // Clear exhaustion for updated models so the user isn't stuck with old locks
    for (const modelId of Object.values(cleanAssignments)) {
      await clearModelExhausted(modelId).catch(() => {});
    }

    // Update in-memory cache immediately
    const fullConfig = await getDynamicModelConfig();
    const merged = { ...fullConfig, ...cleanAssignments };
    setCachedDynamicModels(merged);

    return NextResponse.json({
      ok: true,
      data: {
        assignments: merged,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const body = await req.json().catch(() => ({}));
    if (body.action === "clear_cooldowns") {
      if (typeof body.model === "string" && body.model.trim()) {
        await clearModelExhausted(body.model.trim());
      } else {
        await clearAllModelExhaustion();
      }
      return NextResponse.json({
        ok: true,
        data: { message: "Model cooldowns reset successfully" },
      });
    }

    const model = typeof body.model === "string" ? body.model.trim() : "";

    if (!model) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_ARGUMENT", message: "Model ID is required" } },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    try {
      const { text, inTokens, outTokens, latencyMs } = await testSingleModel(model);

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
