import { generateWithFallback } from "@/lib/ai/router";
import { AssignmentPayload, AssignmentPayloadSchema } from "./assignments";

export interface GenerateAssignmentInput {
  classTitle: string;
  subject: string;
  classDescription: string;
  kind: "theory" | "practical";
  selectedKcs: Array<{ id: string; title: string }>;
  difficulty: "introductory" | "intermediate" | "advanced" | "olympiad";
  numItems?: number; // Questions count for theory, or steps/questions for practical
  specialInstructions?: string;
  userId?: string;
}

/**
 * Multi-Agent Pipeline for Course Assignments:
 *
 * Stage 1: Curriculum Architect Agent
 *   Scopes the learning objectives, Bloom's cognitive taxonomy distribution,
 *   and real-world application context.
 *
 * Stage 2: Pedagogical Author Agent
 *   Drafts the full questions, scenarios, mark breakdown, exemplar solutions,
 *   or laboratory apparatus, step-by-step procedure, and data tables.
 *
 * Stage 3: Peer Reviewer & Verifier Agent
 *   Inspects mathematical validity, catches ambiguities, tightens rubric criteria,
 *   and formats into structured JSON.
 */
export async function runMultiAgentAssignmentGenerator(
  input: GenerateAssignmentInput
): Promise<AssignmentPayload> {
  const kcsContext = input.selectedKcs.map((k) => `• [${k.id}] ${k.title}`).join("\n");

  // ==========================================
  // AGENT 1: Curriculum Architect
  // ==========================================
  const architectPrompt = `You are the Curriculum Architect Agent for an advanced adaptive educational platform.
Class: "${input.classTitle}" (${input.subject})
Description: ${input.classDescription}
Assignment Type: ${input.kind.toUpperCase()}
Target Difficulty: ${input.difficulty}
Knowledge Components:
${kcsContext}

Your goal:
Formulate a concise pedagogical architecture plan for this assignment.
1. Outline the 3-4 specific cognitive learning objectives (e.g. Apply, Analyze, Evaluate).
2. For Theory: Define the problem arc from fundamental recall to novel transfer scenarios.
3. For Practical: Define the empirical investigation hypothesis, variable controls, and real-world apparatus setup.
${input.specialInstructions ? `Special constraints: ${input.specialInstructions}` : ""}

Keep your blueprint crisp and actionable (max 300 words).`;

  const architectResult = await generateWithFallback({
    task: "structured_spec",
    userPrompt: architectPrompt,
    userId: input.userId,
    isPrivileged: true,
  });

  const architectPlan = architectResult.text || "Focus on rigorous conceptual depth and analytical rubrics.";

  // ==========================================
  // AGENT 2: Pedagogical Author
  // ==========================================
  const authorPrompt = `You are the Pedagogical Author Agent.
Using the Architect Blueprint below, draft the complete assignment:

ARCHITECT BLUEPRINT:
${architectPlan}

REQUIREMENTS:
- Assignment Kind: ${input.kind}
- Number of items: ${input.numItems || (input.kind === "theory" ? 4 : 5)}
- Difficulty: ${input.difficulty}
${
  input.kind === "theory"
    ? `Create high-caliber questions with LaTeX math (wrap with dollar signs), realistic contextual scenarios, exact marks distribution, step-by-step marking rubrics, and model exemplar answers.`
    : `Create an experimental investigation with clear independent/dependent/controlled variables, exact apparatus list, safety notes, numbered procedure steps, data collection table template, and analytical questions with mark allocations.`
}

Provide the complete raw draft.`;

  const authorResult = await generateWithFallback({
    task: "structured_spec",
    userPrompt: authorPrompt,
    userId: input.userId,
    isPrivileged: true,
  });

  const draftContent = authorResult.text || "";

  // ==========================================
  // AGENT 3: Reviewer & Verifier (Outputs Validated JSON)
  // ==========================================
  const reviewerPrompt = `You are the Reviewer & Verifier Agent.
Your job is to critically inspect the assignment draft, ensure 100% scientific/mathematical correctness, remove ambiguity, verify rubrics, and structure the output strictly as valid JSON adhering to the target schema.

DRAFT TO REVIEW:
${draftContent}

TARGET SPECIFICATIONS:
- Class Title: "${input.classTitle}"
- Subject: "${input.subject}"
- Kind: "${input.kind}"
- Difficulty: "${input.difficulty}"
- Target KCs: ${JSON.stringify(input.selectedKcs.map((k) => k.id))}

Produce a single JSON object with this exact shape:
{
  "title": "Clear assignment title",
  "kind": "${input.kind}",
  "targetKcIds": ${JSON.stringify(input.selectedKcs.map((k) => k.id))},
  "difficulty": "${input.difficulty}",
  "estimatedMinutes": 45,
  "overview": "Comprehensive introduction and student instructions",
  ${
    input.kind === "theory"
      ? `"theoryQuestions": [
    {
      "id": "q1",
      "number": 1,
      "type": "conceptual_analysis",
      "question": "Question text with LaTeX where applicable",
      "scenarioContext": "Optional scenario context",
      "marks": 10,
      "rubric": [
        { "criterion": "Identified correct law/equation", "points": 4, "description": "Details..." },
        { "criterion": "Correct mathematical computation", "points": 6, "description": "Details..." }
      ],
      "exemplarAnswer": "Complete worked exemplar solution",
      "distractorMisconceptions": ["Common misconception to watch for"]
    }
  ],`
      : `"practicalExperiment": {
    "objective": "Clear experimental objective",
    "variables": {
      "independent": "Name and unit",
      "dependent": "Name and unit",
      "controlled": ["Variable 1", "Variable 2"]
    },
    "apparatus": [
      { "item": "Component/Instrument", "specification": "Specs..." }
    ],
    "procedure": [
      { "stepNumber": 1, "instruction": "Step details...", "safetyOrTip": "Safety hint" }
    ],
    "dataCollectionTable": {
      "columns": ["Trial", "Input (Unit)", "Output (Unit)"],
      "sampleRowHint": "Example: Trial 1, 10V, 2.5A"
    },
    "analysisQuestions": [
      { "question": "Analysis question...", "marks": 5, "guide": "What student must calculate" }
    ],
    "totalMarks": 25
  },`
  }
  "teacherNotes": "Brief confidential guidance for the teacher, common pitfalls, and grading advice"
}

Respond ONLY with valid JSON. Do not wrap with markdown code fences if possible, or use standard \`\`\`json.`;

  const reviewerResult = await generateWithFallback({
    task: "structured_spec",
    userPrompt: reviewerPrompt,
    userId: input.userId,
    isPrivileged: true,
  });

  const rawJson = reviewerResult.text || "{}";
  let cleaned = rawJson.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(cleaned);
  const validated = AssignmentPayloadSchema.parse({
    ...parsed,
    kind: input.kind,
    targetKcIds: input.selectedKcs.map((k) => k.id),
    status: "draft",
  });

  return validated;
}
