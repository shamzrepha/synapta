import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { generateWithFallback } from "@/lib/ai/router";
import { computeContentHash, ContentKind, ContentLevel } from "@/lib/teacher/cache";
import { runPedagogicalQualityCheck } from "@/lib/teacher/qualityCheck";
import { REPRESENTATION_METADATA, Representation } from "@/lib/teacher/representations";
import { z } from "zod";

export const runtime = "nodejs";

const generateContentSchema = z.object({
  kind: z.enum(["explanation", "quiz", "flashcards", "worked_example"]),
  representation: z.string().optional().default("worked_example"),
  level: z.enum(["beginner", "standard", "advanced"]).optional().default("standard"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");

    const body = await req.json();
    const parsed = generateContentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid payload" } },
        { status: 400 }
      );
    }

    const { kind, representation, level } = parsed.data;

    // Fetch KC document
    const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
    const kcDoc = await kcRef.get();
    if (!kcDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Topic not found" } },
        { status: 404 }
      );
    }

    const kcData = kcDoc.data()!;
    const kcTitle = kcData.title || "Concept";
    const lessonMarkdown = kcData.lessonMarkdown || kcData.description || "";

    // Quota check for teacher
    await checkRateLimitAndQuota(caller.uid, 2000);

    const repMeta = REPRESENTATION_METADATA[representation as Representation] || REPRESENTATION_METADATA.worked_example;

    let prompt = "";
    if (kind === "explanation" || kind === "worked_example") {
      prompt = `You are Sunroot's Master Curriculum Author. Write a high-yield, comprehensive learning piece for:
Topic: "${kcTitle}"
Academic Level: ${level}
Pedagogical Format: ${repMeta.label}
Format Instruction: ${repMeta.promptInstruction}

Source Lesson Content:
<LESSON>
${lessonMarkdown}
</LESSON>

Write a detailed, beautifully formatted markdown module including equations (use $...$ and $$...$$ LaTeX).`;
    } else if (kind === "quiz") {
      prompt = `Generate 5 rigorous conceptual multiple-choice quiz questions for "${kcTitle}".
Format as strict JSON:
{
  "questions": [
    {
      "question": "Prompt text",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Why correct",
      "difficulty": "${level}"
    }
  ]
}
Ground strictly in:
${lessonMarkdown}`;
    } else {
      prompt = `Generate 8 active recall flashcards for "${kcTitle}".
Format as strict JSON:
{
  "cards": [
    { "front": "Prompt/Question", "back": "Precise principle/formula" }
  ]
}
Ground strictly in:
${lessonMarkdown}`;
    }

    const fallbackResult = await generateWithFallback({
      task: "structured_spec",
      userPrompt: prompt,
      userId: caller.uid,
    });

    const rawContentText = fallbackResult.text;
    let finalContent: unknown = rawContentText;
    if (kind === "quiz" || kind === "flashcards") {
      try {
        finalContent = JSON.parse(rawContentText);
      } catch {
        finalContent = { text: rawContentText };
      }
    }

    // Run Automated Pedagogical Quality Gate
    const qualityReport = await runPedagogicalQualityCheck({
      lessonMarkdown,
      contentPayload: rawContentText,
      kind,
    });

    // Compute deterministic hash scoped to this class
    const hash = computeContentHash(classId, kcId, kind as ContentKind, representation, level as ContentLevel);
    const contentDocRef = adminDb().collection("contentCache").doc(hash);

    const cacheItem = {
      hash,
      classId,
      kcId,
      kcTitle,
      kind,
      representation,
      level,
      content: finalContent,
      status: "draft" as const, // Teacher approval required before serving to students
      version: 1,
      qualityReport,
      cacheHits: 0,
      createdBy: caller.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await contentDocRef.set(cacheItem);

    return NextResponse.json({
      ok: true,
      data: {
        item: cacheItem,
        tokensUsed: fallbackResult.tokensIn + fallbackResult.tokensOut,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
