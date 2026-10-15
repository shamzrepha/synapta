import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { generateWithFallback, AiGenerationError } from "@/lib/ai/router";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { loadKcGroundingContext } from "@/lib/kc/context";
import { buildSimulationPrompt, parseGeneratedSimulation, type ParsedSimulation } from "./build";

const GENERATION_LOCK_MS = 4 * 60 * 1000;

export interface StoredSimulation extends ParsedSimulation {
  status: "ready" | "generating" | "failed";
  version: number;
  modelUsed?: string;
  instructions?: string;
  createdBy?: string;
  error?: string;
  updatedAt?: FirebaseFirestore.Timestamp;
  generationStartedAt?: FirebaseFirestore.Timestamp;
}

export interface ClientSimulation {
  status: StoredSimulation["status"];
  html?: string;
  title?: string;
  goal?: string;
  howTo?: string[];
  concepts?: string[];
  version?: number;
  instructions?: string;
  error?: string;
  hasCheck: boolean;
  checkQuestion?: { question: string; options: string[] };
  updatedAt?: string;
}

export function simulationRef(classId: string, kcId: string) {
  return adminDb()
    .collection("classes")
    .doc(classId)
    .collection("kcs")
    .doc(kcId)
    .collection("simulations")
    .doc("current");
}

export async function getStoredSimulation(classId: string, kcId: string): Promise<StoredSimulation | null> {
  const snap = await simulationRef(classId, kcId).get();
  return snap.exists ? (snap.data() as StoredSimulation) : null;
}

/** Never ship the answer key to the browser. */
export function toClientSimulation(sim: StoredSimulation | null, opts: { includeInstructions?: boolean } = {}): ClientSimulation | null {
  if (!sim) return null;
  const isStaleLock =
    sim.status === "generating" &&
    sim.generationStartedAt &&
    Date.now() - sim.generationStartedAt.toMillis() > GENERATION_LOCK_MS;
  return {
    status: isStaleLock ? (sim.html ? "ready" : "failed") : sim.status,
    html: sim.html,
    title: sim.title,
    goal: sim.goal,
    howTo: sim.howTo,
    concepts: sim.concepts,
    version: sim.version,
    instructions: opts.includeInstructions ? sim.instructions : undefined,
    error: sim.error,
    hasCheck: !!sim.checkQuestion,
    checkQuestion: sim.checkQuestion
      ? { question: sim.checkQuestion.question, options: sim.checkQuestion.options }
      : undefined,
    updatedAt: sim.updatedAt?.toDate?.().toISOString(),
  };
}

/**
 * Generates (or regenerates) the topic's simulation. A Firestore lock prevents several students
 * opening the same topic from triggering duplicate, quota-burning generations.
 */
export async function generateAndStoreSimulation(params: {
  classId: string;
  kcId: string;
  userId: string;
  instructions?: string;
  previousError?: string;
  /** Teachers may replace an existing simulation; students may only create the first one. */
  allowReplace: boolean;
}): Promise<StoredSimulation> {
  const ref = simulationRef(params.classId, params.kcId);

  const existingBefore = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const existing = snap.exists ? (snap.data() as StoredSimulation) : null;
    if (existing?.status === "generating" && existing.generationStartedAt) {
      const age = Date.now() - existing.generationStartedAt.toMillis();
      if (age < GENERATION_LOCK_MS) {
        throw new ApiError(409, "SIM_GENERATING", "This simulation is already being built. It will appear in about a minute.");
      }
    }
    if (existing?.status === "ready" && existing.html && !params.allowReplace) {
      throw new ApiError(409, "SIM_EXISTS", "A simulation already exists for this topic.");
    }
    t.set(
      ref,
      { status: "generating", generationStartedAt: Timestamp.now(), error: null },
      { merge: true }
    );
    return existing;
  });

  const releaseWithFailure = async (message: string) => {
    await ref
      .set(
        {
          // Keep serving the previous version if there was one
          status: existingBefore?.html ? "ready" : "failed",
          error: message,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      )
      .catch(() => null);
  };

  try {
    await checkRateLimitAndQuota(params.userId, 12000);
    const ctx = await loadKcGroundingContext(params.classId, params.kcId, { materialBudget: 6000 });

    let parsed: ParsedSimulation | null = null;
    let modelUsed = "";
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const { systemInstruction, userPrompt } = buildSimulationPrompt({
        kcTitle: ctx.kcTitle,
        subject: ctx.subject,
        level: ctx.level,
        contextText: ctx.contextText,
        teacherInstructions: params.instructions,
        previousError:
          params.previousError ||
          (attempt > 0 ? "Your last answer was not a complete runnable HTML document with an inline <script> and a <canvas> or <svg>." : undefined),
      });
      const result = await generateWithFallback({
        task: "sim_build",
        systemInstruction,
        userPrompt,
        userId: params.userId,
        temperature: 0.6,
        isPrivileged: true,
      });
      modelUsed = result.modelUsed;
      parsed = parseGeneratedSimulation(result.text, ctx.kcTitle);
    }

    if (!parsed) {
      throw new AiGenerationError("The AI couldn't build a working simulation for this topic. Try again, or add more specific instructions.");
    }

    const stored: StoredSimulation = {
      ...parsed,
      status: "ready",
      version: (existingBefore?.version || 0) + 1,
      modelUsed,
      instructions: params.instructions || "",
      createdBy: params.userId,
      error: undefined,
    };
    await ref.set({ ...stored, error: null, updatedAt: Timestamp.now() });
    return { ...stored, updatedAt: Timestamp.now() };
  } catch (err) {
    await releaseWithFailure(err instanceof ApiError ? err.message : "Simulation generation failed.");
    throw err;
  }
}
