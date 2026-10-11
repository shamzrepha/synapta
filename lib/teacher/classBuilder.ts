import { executeStructuredAiTask, AiQuotaExhaustedError } from "@/lib/ai/router";
import { sanitizeUntrustedPromptText } from "@/lib/ai/scrub";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export function extractOutlineHeadings(text?: string): string[] {
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const headings: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(?:(?:\d+[\.\)]|(?:Week|Chapter|Unit|Module|Section|Topic)\s+\d+[:\.\-]?|#{1,4}|[-*•])\s+)(.+)$/i);
    if (m && m[1].length >= 3 && m[1].length <= 120) {
      headings.push(m[1].trim());
    } else if (line.length >= 4 && line.length <= 80 && !line.endsWith(".") && !line.endsWith(",")) {
      headings.push(line);
    }
  }
  return headings.slice(0, 30);
}

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
  description: z.string().default("Course module"),
  week: z.coerce.number().int().min(1).default(1),
  objectives: z.array(z.string()).default(["Master foundational concepts"]),
  prerequisiteTitles: z.array(z.string()).default([]),
  difficulty: z.enum(["introductory", "intermediate", "advanced"]).default("intermediate"),
  // Notebook-style hierarchy: empty/omitted = top-level topic, otherwise exact title of the parent topic
  parentTopic: z.string().optional().nullable(),
  sourceMaterialTitles: z.array(z.string()).optional().default([]),
});

export type KcSpec = z.infer<typeof kcSpecSchema>;
export interface ClassPlan {
  clarifications?: string[];
  kcs: KcSpec[];
}

const classPlanSchema: z.ZodType<ClassPlan, z.ZodTypeDef, unknown> = z.preprocess((val) => {
  if (Array.isArray(val)) {
    return { kcs: val };
  }
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (Array.isArray(obj.kcs)) {
      return obj;
    }
    if (Array.isArray(obj.topics)) {
      return { ...obj, kcs: obj.topics };
    }
    if (Array.isArray(obj.modules)) {
      return { ...obj, kcs: obj.modules };
    }
  }
  return val;
}, z.object({
  clarifications: z.array(z.string()).optional(),
  kcs: z.array(kcSpecSchema).min(1).max(60),
}));

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
  status: "ready" | "needs_review" | "waiting_quota";
  kcCount: number;
  clarifications?: string[];
  resumeAt?: string;
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

  const cleanDescription = sanitizeUntrustedPromptText(input.description, 4000);

  // Document library: pull every uploaded material for this class (text extracted at upload time)
  const libSnap = await adminDb()
    .collection("classes")
    .doc(input.classId)
    .collection("materials")
    .get()
    .catch(() => null);
  const libraryDocs: Array<{ id: string; title?: string; fileName?: string; extractedText?: string }> = (libSnap?.docs || [])
    .map((d) => ({ id: d.id, ...(d.data() as { title?: string; fileName?: string; extractedText?: string }) }))
    .filter((d) => typeof d.extractedText === "string" && d.extractedText.length > 0);
  const PER_DOC_BUDGET = libraryDocs.length > 0 ? Math.floor(90000 / libraryDocs.length) : 0;
  const libraryText = libraryDocs
    .map((d) => {
      const text = d.extractedText as string;
      // Even sampling across the document when it exceeds the per-doc budget
      let body = text;
      if (text.length > PER_DOC_BUDGET) {
        const chunks = 6;
        const size = Math.floor(PER_DOC_BUDGET / chunks);
        const step = Math.floor(text.length / chunks);
        body = Array.from({ length: chunks }, (_, i) => text.slice(i * step, i * step + size)).join("\n...\n");
      }
      return `=== DOCUMENT: ${String(d.title || d.fileName || d.id)} ===\n${body}`;
    })
    .join("\n\n");

  const cleanSeed = sanitizeUntrustedPromptText(
    [input.seedMaterialText || "", libraryText].filter(Boolean).join("\n\n"),
    100000
  );

  const outlineHeadings = extractOutlineHeadings(input.seedMaterialText);

  const systemInstruction = `You are Synapta's Senior AI Co-Teacher and Curriculum Architect.
Your task is to structure a master Knowledge Component (KC) graph for a course.

Rules:
1. Target Level: ${input.level}. Duration: ${input.durationWeeks} weeks.
2. Audience adaptation tags: ${(input.audienceTags || []).join(", ") || "General STEM"}.
3. Generate between 8 and 50 Knowledge Components logically ordered by week. When source documents are provided, derive the topics and subtopics FROM THE DOCUMENTS (their chapters, headings and content), not from general knowledge.
3b. Organise like a mind map: top-level topics have no parentTopic; each subtopic sets parentTopic to the EXACT title of its parent topic. Include sourceMaterialTitles naming the document(s) each KC comes from.
3c. Choose each KC's difficulty (introductory/intermediate/advanced) from the document's depth; this seeds mastery priors, heatmap and quest map.
4. Each KC must have Bloom-tagged learning objectives (e.g. "[Understand] ...", "[Apply] ...").
5. Specify prerequisiteTitles using the exact titles of previously introduced KCs in this course.
6. Absolutely NO circular dependencies.
${
  outlineHeadings.length >= 2
    ? `\n7. CRITICAL OUTLINE MAPPING DIRECTIVE:
The teacher provided the following exact ${outlineHeadings.length} curriculum outline topics:
${outlineHeadings.map((h, i) => `${i + 1}. ${h}`).join("\n")}
You MUST map these headings 1:1 into Knowledge Components, preserving the titles and sequencing exactly.`
    : ""
}`;

  const userPrompt = `Course Title: ${input.title}
Subject: ${input.subject}
Course Vision & Learning Goals:
${cleanDescription}

${cleanSeed ? `Seed Uploaded Material Reference:\n${cleanSeed}\n` : ""}

Synthesize the concept map.`;

  await jobRef.update({ step: "drafting_map", pct: 35, updatedAt: Timestamp.now() });

  let aiResult: { data: ClassPlan; modelUsed: string; tokensIn: number; tokensOut: number; latencyMs: number; fallbackTriggered: boolean };
  try {
    aiResult = await executeStructuredAiTask<ClassPlan>({
      task: "class_build",
      systemInstruction,
      userPrompt,
      schema: classPlanSchema,
      userId: input.userId,
      estimatedTokens: 3500,
    });
  } catch (err: unknown) {
    if (err instanceof AiQuotaExhaustedError) {
      console.warn(`[classBuilder] Daily quota exhausted during class build for ${input.classId}. Pausing job until ${err.resumeAt}.`);
      await jobRef.update({
        status: "waiting_quota",
        step: "paused_quota",
        resumeAt: err.resumeAt,
        resumeTimestampMs: err.resumeTimestampMs,
        input,
        updatedAt: Timestamp.now(),
      });
      await adminDb().collection("classes").doc(input.classId).update({
        buildState: "waiting_quota",
        resumeAt: err.resumeAt,
        updatedAt: Timestamp.now(),
      });
      return {
        jobId: effectiveJobId,
        status: "waiting_quota",
        resumeAt: err.resumeAt,
        kcCount: 0,
      };
    }
    await jobRef.update({
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      updatedAt: Timestamp.now(),
    });
    await adminDb().collection("classes").doc(input.classId).update({
      buildState: "failed",
      buildError: err instanceof Error ? err.message : "Failed to structure class with AI. Please retry.",
      updatedAt: Timestamp.now(),
    }).catch(() => null);
    throw err;
  }

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
      parentTitle: (kc.parentTopic || "").trim(),
      sourceMaterialTitles: kc.sourceMaterialTitles || [],
    };
  });

  const materialIdByTitle = new Map<string, string>();
  for (const d of libraryDocs) {
    materialIdByTitle.set(String(d.title || d.fileName || "").toLowerCase().trim(), d.id);
  }

  // 2. Resolve prerequisite titles + parent topic to IDs
  const nodesForDag = preparedKcs.map((kc) => {
    const prereqIds: string[] = [];
    for (const title of kc.prerequisiteTitles || []) {
      const matchId = titleToIdMap.get(title.toLowerCase().trim());
      if (matchId && matchId !== kc.id) {
        prereqIds.push(matchId);
      }
    }
    const parentMatch = kc.parentTitle ? titleToIdMap.get(kc.parentTitle.toLowerCase()) : undefined;
    const sourceIds = kc.sourceMaterialTitles
      .map((t) => materialIdByTitle.get(t.toLowerCase().trim()))
      .filter((x): x is string => !!x);
    return {
      ...kc,
      prerequisiteIds: prereqIds,
      parentId: parentMatch && parentMatch !== kc.id ? parentMatch : null,
      sourceMaterialIds: sourceIds.length > 0 ? sourceIds : libraryDocs.map((d) => d.id),
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
      sourceMaterialIds: kc.sourceMaterialIds,
      parentId: kc.parentId,
      difficulty: kc.difficulty,
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
