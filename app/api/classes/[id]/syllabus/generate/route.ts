import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { generateStructuredJson } from "@/lib/gemini/client";
import { getSyllabusSynthesisPrompt } from "@/lib/gemini/prompts";
import { syllabusSynthesisResponseSchema } from "@/lib/gemini/schemas";
import { z } from "zod";

export const runtime = "nodejs";

const generateSyllabusInputSchema = z.object({
  subject: z.string().min(2),
  level: z.string().default("Intermediate undergraduate"),
  weeks: z.number().int().min(1).max(20).default(6),
  teacherNotes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    // Verify class ownership
    const classRef = adminDb().collection("classes").doc(id);
    const classDoc = await classRef.get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    if (classData.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Only class owner or admin can synthesize syllabus" } },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = generateSyllabusInputSchema.safeParse({
      subject: body.subject || classData.subject,
      level: body.level || "College/Undergraduate",
      weeks: body.weeks || 6,
      teacherNotes: body.teacherNotes,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    // Rate limit and token quota check
    await checkRateLimitAndQuota(caller.uid, 2500);

    const { systemInstruction, userPrompt } = getSyllabusSynthesisPrompt({
      subject: parsed.data.subject,
      level: parsed.data.level,
      weeks: parsed.data.weeks,
      teacherNotes: parsed.data.teacherNotes,
    });

    const { data, tokensIn, tokensOut } = await generateStructuredJson({
      systemInstruction,
      userPrompt,
      schema: syllabusSynthesisResponseSchema,
    });

    // Record token usage
    await recordTokenUsage(caller.uid, tokensIn, tokensOut);

    // Save KCs to Firestore subcollection classes/{id}/kcs
    const kcsCollection = classRef.collection("kcs");

    // 1. Prepare doc IDs for all generated KCs
    const titleToIdMap = new Map<string, string>();
    const preparedKcs = data.kcs.map((kc, index) => {
      const docRef = kcsCollection.doc();
      titleToIdMap.set(kc.title.trim().toLowerCase(), docRef.id);
      return {
        id: docRef.id,
        order: index + 1,
        ...kc,
      };
    });

    // 2. Resolve prerequisiteTitles into prerequisiteIds
    const batch = adminDb().batch();
    const finalKcs = preparedKcs.map((kc) => {
      const prerequisiteIds = (kc.prerequisiteTitles || [])
        .map((title) => titleToIdMap.get(title.trim().toLowerCase()))
        .filter((id): id is string => Boolean(id));

      const kcPayload = {
        id: kc.id,
        order: kc.order,
        title: kc.title,
        description: kc.description,
        objectives: kc.objectives,
        lessonMarkdown: kc.lessonMarkdown,
        prerequisiteIds,
        bkt: kc.bkt,
        lab: kc.lab,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = kcsCollection.doc(kc.id);
      batch.set(docRef, kcPayload);
      return kcPayload;
    });

    await batch.commit();

    // Update class updatedAt
    await classRef.update({ updatedAt: Timestamp.now() });

    return NextResponse.json({
      ok: true,
      data: {
        kcs: finalKcs,
        tokensUsed: tokensIn + tokensOut,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
