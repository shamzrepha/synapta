import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { generateStructuredJson } from "@/lib/gemini/client";
import { quizResponseSchema } from "@/lib/gemini/schemas";
import { selectNextAdaptiveKc, KcGraphNode } from "@/lib/bkt/propagate";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await params;
    const caller = await requireUser(req);

    // Verify active enrollment or teacher access
    await assertClassAccess(caller, classId, "view");

    // Fetch KCs for this class
    const kcsSubSnap = await adminDb()
      .collection("classes")
      .doc(classId)
      .collection("kcs")
      .orderBy("order", "asc")
      .get();

    let rawKcs: Array<{
      id: string;
      title: string;
      description?: string;
      lessonMarkdown?: string;
      prerequisiteIds?: string[];
      bkt?: { pL0?: number };
    }> = [];

    if (!kcsSubSnap.empty) {
      rawKcs = kcsSubSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as {
          title: string;
          description?: string;
          lessonMarkdown?: string;
          prerequisiteIds?: string[];
          bkt?: { pL0?: number };
        }),
      }));
    } else {
      const classDoc = await adminDb().collection("classes").doc(classId).get();
      const cData = classDoc.data();
      if (Array.isArray(cData?.kcs)) {
        rawKcs = cData.kcs;
      }
    }

    if (rawKcs.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_KCS", message: "Class has no Knowledge Components to diagnose." } },
        { status: 400 }
      );
    }

    // Build initial pL map using priors (default 0.20)
    const initialPLMap: Record<string, number> = {};
    const kcNodes: KcGraphNode[] = rawKcs.map((k) => {
      initialPLMap[k.id] = k.bkt?.pL0 ?? 0.20;
      return {
        id: k.id,
        title: k.title,
        prerequisiteIds: k.prerequisiteIds || [],
      };
    });

    // Check rate limit before AI generation
    await checkRateLimitAndQuota(caller.uid, 2000);

    // Generate up to 10-12 diagnostic questions sampled across KCs
    // Construct comprehensive prompt asking for 1 representative conceptual item per KC
    const sampleKcs = rawKcs.slice(0, 10);
    const kcsSummary = sampleKcs
      .map((k, i) => `${i + 1}. [KC_ID: ${k.id}] ${k.title}: ${(k.lessonMarkdown || k.description || "").slice(0, 300)}`)
      .join("\n\n");

    const systemInstruction = `You are Synapta's diagnostic assessment designer.
Generate an adaptive placement diagnostic assessment across the following Knowledge Components.
For each specified KC, generate exactly ONE high-yield conceptual multiple-choice question testing understanding rather than simple recall.

RULES:
1. Each question must have:
   - question: clear conceptual prompt
   - options: exactly 4 options
   - correctIndex: 0, 1, 2, or 3
   - explanation: clear explanation of the underlying physical/mathematical principle
   - difficulty: "easy" (for foundational KCs), "medium", or "hard"
   - distractorMisconceptions: array of 4 strings where the correct option has "" and each incorrect option diagnoses a specific misconception (e.g. "Current is consumed", "Adding resistors in parallel increases resistance").
2. Return JSON conforming to the quiz schema with questions matching the KCs.`;

    const userPrompt = `Knowledge Components for Diagnostic Assessment:
${kcsSummary}

Generate ${sampleKcs.length} diagnostic questions.`;

    const { data, tokensIn, tokensOut } = await generateStructuredJson({
      systemInstruction,
      userPrompt,
      schema: quizResponseSchema,
    });

    await recordTokenUsage(caller.uid, tokensIn, tokensOut);

    // Map questions to their corresponding KC IDs
    const questionsWithKcs = data.questions.map((q, idx) => {
      const assignedKc = sampleKcs[idx % sampleKcs.length];
      return {
        ...q,
        kcId: assignedKc.id,
        kcTitle: assignedKc.title,
      };
    });

    // Select the first adaptive question (closest to 0.50 uncertainty or foundational)
    const firstKcId = selectNextAdaptiveKc({
      kcs: kcNodes,
      answeredKcIds: [],
      currentPLMap: initialPLMap,
    }) || questionsWithKcs[0].kcId;

    const firstQuestionIndex = questionsWithKcs.findIndex((q) => q.kcId === firstKcId);
    const resolvedFirstIndex = firstQuestionIndex >= 0 ? firstQuestionIndex : 0;
    const firstQ = questionsWithKcs[resolvedFirstIndex];

    // Create diagnostic session doc in Firestore
    const sessionRef = adminDb().collection("diagnosticSessions").doc();
    await sessionRef.set({
      id: sessionRef.id,
      uid: caller.uid,
      classId,
      questions: questionsWithKcs,
      kcs: kcNodes,
      answered: {},
      currentPLMap: initialPLMap,
      answeredKcIds: [],
      activeQuestionIndex: resolvedFirstIndex,
      finished: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        sessionId: sessionRef.id,
        totalQuestions: questionsWithKcs.length,
        currentQuestionIndex: resolvedFirstIndex,
        question: {
          id: resolvedFirstIndex,
          kcId: firstQ.kcId,
          kcTitle: firstQ.kcTitle,
          question: firstQ.question,
          options: firstQ.options,
          difficulty: firstQ.difficulty,
        },
        currentPLMap: initialPLMap,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
