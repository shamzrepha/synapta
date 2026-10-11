import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { getGeminiClient, getGeminiModel } from "@/lib/gemini/client";
import { getAiTutorSystemPrompt } from "@/lib/gemini/prompts";
import { getServerEnv } from "@/lib/env";
import { z } from "zod";

export const runtime = "nodejs";

const tutorInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        parts: z.string(),
      })
    )
    .optional()
    .default([]),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = tutorInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { classId, kcId, message } = parsed.data;

    // Verify caller has permission to view this class
    await assertClassAccess(caller, classId, "view");

    // Load KC from Firestore
    const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
    const kcDoc = await kcRef.get();
    if (!kcDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Knowledge Component not found" } },
        { status: 404 }
      );
    }

    const kcData = kcDoc.data()!;
    const kcTitle = kcData.title || "Topic";
    const lessonMarkdown = kcData.lessonMarkdown || kcData.description || "Lesson content";
    const objectives = kcData.objectives || [];

    // Load caller's current mastery
    const masteryDoc = await adminDb().collection("mastery").doc(`${caller.uid}_${kcId}`).get();
    const currentPL = masteryDoc.exists ? (masteryDoc.data()?.pL ?? 0.2) : 0.2;

    // Rate limit and token quota check
    await checkRateLimitAndQuota(caller.uid, 500);

    const systemInstruction = getAiTutorSystemPrompt({
      kcTitle,
      lessonMarkdown,
      objectives,
      studentPL: currentPL,
    });

    // Live Gemini Streaming
    const ai = getGeminiClient();
    const model = getGeminiModel();

    const sanitizedContent = `<STUDENT_MESSAGE>\n${message}\n</STUDENT_MESSAGE>`;

    const responseStream = await ai.models.generateContentStream({
      model,
      contents: sanitizedContent,
      config: {
        systemInstruction,
      },
    });

    const encoder = new TextEncoder();
    let totalOutputTokens = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
            if (chunk.usageMetadata?.candidatesTokenCount) {
              totalOutputTokens = chunk.usageMetadata.candidatesTokenCount;
            }
          }
        } catch (streamErr) {
          console.error("Stream error:", streamErr);
          controller.error(streamErr);
        } finally {
          controller.close();
          await recordTokenUsage(caller.uid, 300, totalOutputTokens || 200).catch(() => {});
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
