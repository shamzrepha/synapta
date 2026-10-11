import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { getTeacherSystemPrompt, checkStudentMessageSafety } from "./prompts";
import { REPRESENTATIONS, Representation, REPRESENTATION_METADATA } from "./representations";
import { chooseRepresentation } from "./representation";
import { trackMisconception } from "./misconceptions";

export interface TeacherAgentParams {
  uid: string;
  classId: string;
  kcId: string;
  userMessage: string;
  activeSessionId?: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
}

export interface TeacherAgentResponse {
  reply: string;
  toolCallsExecuted: Array<{ name: string }>;
  suggestedAction?: {
    type: "practice" | "lab" | "review";
    label: string;
    targetTab: string;
  };
}

export async function runTeacherAgent({
  uid,
  classId,
  kcId,
  userMessage,
  activeSessionId,
  history = [],
}: TeacherAgentParams): Promise<TeacherAgentResponse> {
  // 1. Safety & moderation check
  const safety = checkStudentMessageSafety(userMessage);
  if (!safety.safe) {
    return {
      reply: safety.response || "I cannot assist with that request. Let's focus on our academic learning goals.",
      toolCallsExecuted: [],
    };
  }

  // 2. Fetch KC and Class details
  const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
  const kcDoc = await kcRef.get();
  if (!kcDoc.exists) {
    throw new Error("Knowledge Component not found");
  }

  const kcData = kcDoc.data()!;
  const kcTitle = kcData.title || "Topic";
  const lessonMarkdown = kcData.lessonMarkdown || kcData.description || "";
  const objectives = Array.isArray(kcData.objectives) ? kcData.objectives : ["Master concept"];

  // 3. Quota check
  await checkRateLimitAndQuota(uid, 1200);

  const systemInstruction = getTeacherSystemPrompt({
    kcTitle,
    lessonMarkdown,
    objectives,
  });

  // Tool definitions
  const functionDeclarations = [
    {
      name: "get_learner_state",
      description: "Fetches the student's current latent mastery probability P(L), open misconceptions, and past attempts on this concept.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          kcId: { type: "string", description: "The Knowledge Component ID" },
        },
        required: ["kcId"],
      },
    },
    {
      name: "get_lesson",
      description: "Retrieves the full teacher-approved lesson content and mathematical definitions for the concept.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          kcId: { type: "string" },
        },
        required: ["kcId"],
      },
    },
    {
      name: "explain",
      description: "Generates an alternative explanation using a specific pedagogical representation format (e.g. worked_example, analogy, step_by_step, visual_diagram, plain_language).",
      parametersJsonSchema: {
        type: "object",
        properties: {
          representation: {
            type: "string",
            enum: [...REPRESENTATIONS],
            description: "The pedagogical format representation to use",
          },
        },
        required: ["representation"],
      },
    },
    {
      name: "get_hint",
      description: "Retrieves a tiered Socratic hint (level 1 nudge, level 2 partial formulation, level 3 worked step) for an active question.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          level: { type: "integer", enum: [1, 2, 3], description: "Hint ladder tier (1=nudge, 2=formula, 3=step)" },
        },
        required: ["level"],
      },
    },
    {
      name: "log_misconception",
      description: "Diagnoses and records a specific conceptual misconception revealed by the student's reasoning.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          label: { type: "string", description: "Concise diagnosis label for the misconception" },
        },
        required: ["label"],
      },
    },
  ];

  // Tool execution map
  async function executeTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (name) {
      case "get_learner_state": {
        const mDoc = await adminDb().collection("mastery").doc(`${uid}_${kcId}`).get();
        const mData = mDoc.exists ? mDoc.data() : null;
        const pL = typeof mData?.pL === "number" ? mData.pL : 0.20;

        const misSnap = await adminDb()
          .collection("misconceptions")
          .where("uid", "==", uid)
          .where("kcId", "==", kcId)
          .where("resolved", "==", false)
          .get();

        const misconceptions = misSnap.docs.map((d) => d.data().label);
        return {
          pL,
          attempts: mData?.attempts || 0,
          correct: mData?.correct || 0,
          openMisconceptions: misconceptions,
        };
      }

      case "get_lesson": {
        return {
          title: kcTitle,
          lesson: lessonMarkdown.slice(0, 1500),
          objectives,
        };
      }

      case "explain": {
        const rep = (args.representation as Representation) || "worked_example";
        const meta = REPRESENTATION_METADATA[rep] || REPRESENTATION_METADATA.worked_example;
        return {
          representation: rep,
          instruction: meta.promptInstruction,
          note: `Present the concept strictly adhering to this format: ${meta.label}.`,
        };
      }

      case "get_hint": {
        const level = Number(args.level) || 1;
        if (level === 1) {
          return { hint: "Nudge: Identify which physical variables are known, and what fundamental law links them." };
        } else if (level === 2) {
          return { hint: "Formulation: Express the governing algebraic formula without substituting final numerical answers." };
        } else {
          return { hint: "Worked Step: Solve the first algebraic rearrangement, leaving the final numerical verification to the student." };
        }
      }

      case "log_misconception": {
        const label = String(args.label || "concept_confusion");
        await trackMisconception({
          uid,
          classId,
          kcId,
          label,
          description: "Diagnosed in Socratic tutor dialogue",
          isCorrect: false,
        }).catch(() => {});
        return { status: "recorded", label };
      }

      default:
        return { error: `Tool ${name} not recognized` };
    }
  }

  // Build conversation history contents for Gemini
  interface ContentTurn {
    role: "user" | "model";
    parts: Array<Record<string, unknown>>;
  }

  const conversationTurns: ContentTurn[] = [];

  // Add recent past turns (up to 6)
  const recentHistory = history.slice(-6);
  for (const h of recentHistory) {
    conversationTurns.push({
      role: h.role,
      parts: [{ text: h.text }],
    });
  }

  // Add current student message
  conversationTurns.push({
    role: "user",
    parts: [{ text: `<STUDENT_MESSAGE>\n${userMessage}\n</STUDENT_MESSAGE>` }],
  });

  const toolCallsExecuted: Array<{ name: string }> = [];
  let finalReply = "";
  let iterations = 0;
  const MAX_TOOL_CALLS = 6;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  while (iterations < MAX_TOOL_CALLS) {
    iterations++;

    const response = await generateWithFallback({
      task: "tutor_chat",
      contents: conversationTurns,
      systemInstruction,
      temperature: 0.3,
      tools: [{ functionDeclarations }],
      userId: uid,
    });

    totalTokensIn += response.tokensIn || 400;
    totalTokensOut += response.tokensOut || 200;

    // Check if the model requested function calls
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      // Model chose to call one or more tools
      const call = functionCalls[0];
      const callName = call.name || "unknown";
      toolCallsExecuted.push({ name: callName });

      // Execute tool on server
      const toolResult = await executeTool(callName, (call.args as Record<string, unknown>) || {});

      // Append assistant function call to history
      conversationTurns.push({
        role: "model",
        parts: [{ functionCall: call }],
      });

      // Append tool execution response to history
      conversationTurns.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: callName,
              response: toolResult,
            },
          },
        ],
      });
    } else {
      // Model returned final text answer
      finalReply = response.text || "I am ready to help you explore this topic. What question do you have?";
      break;
    }
  }

  if (!finalReply) {
    finalReply = "Let's review the main idea together: what part of the concept would you like to clarify first?";
  }

  // Record total token usage
  await recordTokenUsage(uid, totalTokensIn, totalTokensOut).catch(() => {});

  // Persist message in tutor thread
  const threadRef = adminDb().collection("tutorThreads").doc(`${uid}_${classId}_${kcId}`);
  await threadRef.collection("messages").add({
    userMessage,
    reply: finalReply,
    toolCallsCount: toolCallsExecuted.length,
    timestamp: Timestamp.now(),
  }).catch(() => {});

  return {
    reply: finalReply,
    toolCallsExecuted,
  };
}
