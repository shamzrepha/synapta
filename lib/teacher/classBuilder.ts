import { executeStructuredAiTask } from "@/lib/ai/router";
import { sanitizeUntrustedPromptText } from "@/lib/ai/scrub";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export interface ClassBuildInput {
  classId: string;
  title: string;
  subject: string;
  description: string;
  level: "school" | "undergrad" | "professional";
  durationWeeks: number;
  audienceTags?: string[];
  seedMaterialText?: string;
  userId?: string;
}

export interface GeneratedKcSpec {
  slug: string;
  title: string;
  description: string;
  week: number;
  objectives: string[];
  prerequisiteTitles: string[];
  bkt: {
    pL0: number;
    pT: number;
    pG: number;
    pS: number;
  };
}

const kcSpecSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(5),
  week: z.number().int().min(1),
  objectives: z.array(z.string()).min(1),
  prerequisiteTitles: z.array(z.string()).default([]),
  difficulty: z.enum(["introductory", "intermediate", "advanced"]).default("intermediate"),
});

const classPlanSchema = z.object({
  clarifications: z.array(z.string()).optional(),
  kcs: z.array(kcSpecSchema).min(3).max(40),
});

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Validates a DAG of KCs and removes any back-edges that create cycles.
 */
export function validateAndPruneCycles(
  nodes: Array<{ id: string; prerequisiteIds: string[] }>
): { hasCycle: boolean; prunedEdges: Array<{ from: string; to: string }> } {
  const nodeMap = new Map<string, { id: string; prerequisiteIds: string[] }>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const prunedEdges: Array<{ from: string; to: string }> = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(curr: string) {
    visited.add(curr);
    recStack.add(curr);

    const node = nodeMap.get(curr);
    const prereqs = node ? node.prerequisiteIds : [];
    for (let i = prereqs.length - 1; i >= 0; i--) {
      const neighbor = prereqs[i];
      if (!nodeMap.has(neighbor)) {
        prereqs.splice(i, 1);
        continue;
      }
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Cycle detected: prune the cycle-creating edge
        prunedEdges.push({ from: curr, to: neighbor });
        prereqs.splice(i, 1);
      }
    }

    recStack.delete(curr);
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      dfs(n.id);
    }
  }

  return {
    hasCycle: prunedEdges.length > 0,
    prunedEdges,
  };
}

/**
 * Derives initial Bayesian Knowledge Tracing priors from level and difficulty.
 */
export function deriveBktPriors(
  difficulty: "introductory" | "intermediate" | "advanced",
  level: "school" | "undergrad" | "professional"
): { pL0: number; pT: number; pG: number; pS: number } {
  let pL0 = 0.25;
  let pT = 0.15;
  let pG = 0.20;
  let pS = 0.10;

  if (difficulty === "introductory") {
    pL0 = level === "school" ? 0.30 : 0.25;
    pT = 0.20;
    pG = 0.25;
    pS = 0.08;
  } else if (difficulty === "advanced") {
    pL0 = 0.10;
    pT = 0.10;
    pG = 0.15;
    pS = 0.14;
  }

  return { pL0, pT, pG, pS };
}

/**
 * Executes the AI Co-Teacher Class Build Pipeline.
 * Resumable, idempotent, and saves progress to classes/{classId}/buildJobs/{jobId}.
 */
export async function buildClassWithAi(input: ClassBuildInput, jobId?: string): Promise<{
  jobId: string;
  status: "ready" | "needs_review";
  kcCount: number;
  clarifications?: string[];
}> {
  const effectiveJobId = jobId || `job_${Date.now()}`;
  const jobRef = adminDb()
    .collection("classes")
    .doc(input.classId)
    .collection("buildJobs")
    .doc(effectiveJobId);

  // Initialize or update build job
  await jobRef.set(
    {
      id: effectiveJobId,
      step: "scoping",
      pct: 10,
      status: "running",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  const cleanDescription = sanitizeUntrustedPromptText(input.description, 2000);
  const cleanSeed = input.seedMaterialText
    ? sanitizeUntrustedPromptText(input.seedMaterialText, 8000)
    : "";

  const systemInstruction = `You are Synapta's Senior AI Co-Teacher and Curriculum Architect.
Your task is to structure a master Knowledge Component (KC) graph for a course.

Rules:
1. Target Level: ${input.level}. Duration: ${input.durationWeeks} weeks.
2. Audience adaptation tags: ${(input.audienceTags || []).join(", ") || "General STEM"}.
3. Generate between 8 and 25 granular Knowledge Components logically ordered by week.
4. Each KC must have Bloom-tagged learning objectives (e.g. "[Understand] ...", "[Apply] ...").
5. Specify prerequisiteTitles using the exact titles of previously introduced KCs in this course.
6. Absolutely NO circular dependencies.`;

  const userPrompt = `Course Title: ${input.title}
Subject: ${input.subject}
Course Vision & Learning Goals:
${cleanDescription}

${cleanSeed ? `Seed Uploaded Material Reference:\n${cleanSeed}\n` : ""}

Synthesize the concept map.`;

  await jobRef.update({ step: "drafting_map", pct: 35, updatedAt: Timestamp.now() });

  const aiResult = await executeStructuredAiTask({
    task: "structured_spec",
    systemInstruction,
    userPrompt,
    schema: classPlanSchema,
    userId: input.userId,
    estimatedTokens: 3500,
  });

  const { kcs: rawKcs, clarifications } = aiResult.data;

  // 1. Resolve Slugs & Map Titles to IDs
  const titleToIdMap = new Map<string, string>();
  const preparedKcs = rawKcs.map((kc, index) => {
    const slug = `${String(index + 1).padStart(2, "0")}-${slugify(kc.title)}`;
    titleToIdMap.set(kc.title.toLowerCase().trim(), slug);
    return {
      id: slug,
      title: kc.title.trim(),
      description: kc.description.trim(),
      order: index + 1,
      week: kc.week || Math.min(Math.ceil((index + 1) / 3), input.durationWeeks),
      objectives: kc.objectives,
      prerequisiteTitles: kc.prerequisiteTitles,
      difficulty: kc.difficulty ?? "intermediate",
      bkt: deriveBktPriors(kc.difficulty ?? "intermediate", input.level || "undergrad"),
    };
  });

  // 2. Resolve prerequisite titles to IDs
  const nodesForDag = preparedKcs.map((kc) => {
    const prereqIds: string[] = [];
    for (const title of kc.prerequisiteTitles || []) {
      const matchId = titleToIdMap.get(title.toLowerCase().trim());
      if (matchId && matchId !== kc.id) {
        prereqIds.push(matchId);
      }
    }
    return {
      ...kc,
      prerequisiteIds: prereqIds,
    };
  });

  // 3. Cycle Detection & Pruning
  const { hasCycle } = validateAndPruneCycles(nodesForDag);

  await jobRef.update({ step: "writing_initial_lessons", pct: 70, updatedAt: Timestamp.now() });

  // 4. Batch commit to Firestore (Idempotent: uses stable slug IDs so re-running never duplicates)
  const kcsCollection = adminDb()
    .collection("classes")
    .doc(input.classId)
    .collection("kcs");

  const batch = adminDb().batch();

  nodesForDag.forEach((kc, idx) => {
    const kcRef = kcsCollection.doc(kc.id);
    const kcDoc = {
      id: kc.id,
      title: kc.title,
      description: kc.description,
      order: kc.order,
      week: kc.week,
      objectives: kc.objectives,
      prerequisiteIds: kc.prerequisiteIds,
      bkt: kc.bkt,
      status: "draft" as const, // Starts as draft until approved or published
      source: "ai_topic" as const,
      sourceMaterialIds: [] as string[],
      aliases: [kc.title.toLowerCase()],
      contentVersion: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      // Eagerly draft first module starter lesson
      ...(idx < 3
        ? {
            lessonMarkdown: `# ${kc.title}\n\n${kc.description}\n\n## Learning Objectives\n${kc.objectives.map((o) => `- ${o}`).join("\n")}`,
          }
        : {}),
    };
    batch.set(kcRef, kcDoc, { merge: true });
  });

  // Update Class buildState
  const finalBuildState = hasCycle || (clarifications && clarifications.length > 0) ? "needs_review" : "ready";
  const classRef = adminDb().collection("classes").doc(input.classId);
  batch.update(classRef, {
    buildState: finalBuildState,
    updatedAt: Timestamp.now(),
  });

  await batch.commit();

  await jobRef.update({
    step: "completed",
    pct: 100,
    status: "completed",
    finalState: finalBuildState,
    kcCount: nodesForDag.length,
    updatedAt: Timestamp.now(),
  });

  return {
    jobId: effectiveJobId,
    status: finalBuildState,
    kcCount: nodesForDag.length,
    clarifications,
  };
}
