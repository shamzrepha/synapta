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

    // Run AI Teacher Agent with function calling and pedagogical protocol
    const { runTeacherAgent } = await import("@/lib/teacher/orchestrator");
    const agentResult = await runTeacherAgent({
      uid: caller.uid,
      classId,
      kcId,
      userMessage: message,
      history: (parsed.data.history || []).map((h) => ({
        role: h.role,
        text: h.parts,
      })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(agentResult.reply));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Tool-Calls-Executed": String(agentResult.toolCallsExecuted.length),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
