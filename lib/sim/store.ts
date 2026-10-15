import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { generateWithFallback, AiGenerationError } from "@/lib/ai/router";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { loadKcGroundingContext } from "@/lib/kc/context";
import {
  buildSimulationPrompt,
  buildSimulationEditPrompt,
  parseGeneratedSimulation,
  stripHostInjection,
  type ParsedSimulation,
} from "./build";

const GENERATION_LOCK_MS = 4 * 60 * 1000;
const MAX_EDIT_LOG = 20;
const MAX_HISTORY = 25;

export interface SimEditLogEntry {
  version: number;
  kind: "create" | "rebuild" | "edit" | "fix" | "undo";
  note: string;
  at: string;
}

export interface StoredSimulation extends ParsedSimulation {
  status: "ready" | "generating" | "failed";
  version: number;
  modelUsed?: string;
  instructions?: string;
  createdBy?: string;
  error?: string;
  editLog?: SimEditLogEntry[];
  /** Archived versions available for undo, oldest first (stack). */
  historyVersions?: number[];
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
  editLog?: SimEditLogEntry[];
  canUndo?: boolean;
  updatedAt?: string;
}

export type SimGenerationMode = "create" | "edit";

function simulationsCollection(classId: string, kcId: string) {
  return adminDb()
    .collection("classes")
    .doc(classId)
    .collection("kcs")
    .doc(kcId)
    .collection("simulations");
}

export function simulationRef(classId: string, kcId: string) {
  return simulationsCollection(classId, kcId).doc("current");
}

/** Previous versions live next to `current` as `history_v{version}` so teachers can undo. */
function historyRef(classId: string, kcId: string, version: number) {
  return simulationsCollection(classId, kcId).doc(`history_v${String(version).padStart(4, "0")}`);
}

export function canUndo(sim: StoredSimulation | null): boolean {
  return !!sim?.historyVersions && sim.historyVersions.length > 0;
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
    canUndo: opts.includeInstructions ? canUndo(sim) : undefined,
    editLog: opts.includeInstructions ? (sim.editLog || []).slice(-8) : undefined,
    updatedAt: sim.updatedAt?.toDate?.().toISOString(),
  };
}

function snapshotForHistory(sim: StoredSimulation) {
  return {
    isHistory: true,
    version: sim.version,
    html: sim.html,
    title: sim.title,
    goal: sim.goal,
    howTo: sim.howTo || [],
    concepts: sim.concepts || [],
    checkQuestion: sim.checkQuestion || null,
    instructions: sim.instructions || "",
    editLog: sim.editLog || [],
    historyVersions: [],
    modelUsed: sim.modelUsed || "",
    archivedAt: Timestamp.now(),
  };
}

function appendLog(log: SimEditLogEntry[] | undefined, entry: SimEditLogEntry): SimEditLogEntry[] {
  return [...(log || []), entry].slice(-MAX_EDIT_LOG);
}

/**
 * Generates, rebuilds or edits the topic's simulation.
 *  - mode "create": write a brand-new simulation from the topic (first build, or "start over")
 *  - mode "edit":   send the CURRENT code plus the teacher's change request (or a runtime error)
 *                   and apply only that change
 * The previous version is archived before it is replaced, so every change can be undone.
 * A Firestore lock prevents duplicate, quota-burning generations.
 */
export async function generateAndStoreSimulation(params: {
  classId: string;
  kcId: string;
  userId: string;
  mode?: SimGenerationMode;
  instructions?: string;
  changeRequest?: string;
  previousError?: string;
  /** Teachers may replace or edit an existing simulation; students may only create the first one. */
  allowReplace: boolean;
}): Promise<StoredSimulation> {
  const mode: SimGenerationMode = params.mode || "create";
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
    if (existing?.html && !params.allowReplace) {
      throw new ApiError(409, "SIM_EXISTS", "A simulation already exists for this topic.");
    }
    if (mode === "edit" && !existing?.html) {
      throw new ApiError(409, "SIM_MISSING", "There is no simulation to edit yet. Build one first.");
    }
    t.set(ref, { status: "generating", generationStartedAt: Timestamp.now(), error: null }, { merge: true });
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
    await checkRateLimitAndQuota(params.userId, mode === "edit" ? 20000 : 12000);
    const ctx = await loadKcGroundingContext(params.classId, params.kcId, { materialBudget: 6000 });

    let parsed: ParsedSimulation | null = null;
    let modelUsed = "";
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const retryNote =
        attempt > 0 ? "Your last answer was not a complete runnable HTML document with an inline <script> and a <canvas> or <svg>." : undefined;

      const prompt =
        mode === "edit" && existingBefore?.html
          ? buildSimulationEditPrompt({
              kcTitle: ctx.kcTitle,
              currentHtml: stripHostInjection(existingBefore.html),
              currentMeta: {
                title: existingBefore.title,
                goal: existingBefore.goal,
                howTo: existingBefore.howTo || [],
                concepts: existingBefore.concepts || [],
                checkQuestion: existingBefore.checkQuestion
                  ? {
                      question: existingBefore.checkQuestion.question,
                      options: existingBefore.checkQuestion.options,
                      answer: existingBefore.checkQuestion.options[existingBefore.checkQuestion.correctIndex],
                      explanation: existingBefore.checkQuestion.explanation,
                    }
                  : null,
              },
              changeRequest: params.changeRequest,
              runtimeError: [params.previousError, retryNote].filter(Boolean).join(" ") || undefined,
            })
          : buildSimulationPrompt({
              kcTitle: ctx.kcTitle,
              subject: ctx.subject,
              level: ctx.level,
              contextText: ctx.contextText,
              objectives: ctx.objectives,
              otherTopics: ctx.otherTopics,
              teacherInstructions: params.instructions,
              previousError: params.previousError || retryNote,
            });

      const result = await generateWithFallback({
        task: "sim_build",
        systemInstruction: prompt.systemInstruction,
        userPrompt: prompt.userPrompt,
        userId: params.userId,
        // Edits should stay close to the original code
        temperature: mode === "edit" ? 0.2 : 0.6,
        isPrivileged: true,
      });
      modelUsed = result.modelUsed;
      parsed = parseGeneratedSimulation(result.text, ctx.kcTitle);
    }

    if (!parsed) {
      throw new AiGenerationError(
        mode === "edit"
          ? "The AI couldn't apply that change cleanly. Your simulation is unchanged — try rephrasing the change."
          : "The AI couldn't build a working simulation for this topic. Try again, or add more specific instructions."
      );
    }

    // An edit that drops the check question keeps the previous one, so lab credit isn't lost
    if (mode === "edit" && !parsed.checkQuestion && existingBefore?.checkQuestion) {
      parsed = { ...parsed, checkQuestion: existingBefore.checkQuestion };
    }

    const version = (existingBefore?.version || 0) + 1;
    const kind: SimEditLogEntry["kind"] =
      mode === "edit" ? (params.changeRequest ? "edit" : "fix") : existingBefore?.html ? "rebuild" : "create";
    const note =
      kind === "edit"
        ? params.changeRequest!.slice(0, 200)
        : kind === "fix"
        ? `Fixed: ${(params.previousError || "runtime error").slice(0, 160)}`
        : kind === "rebuild"
        ? `Started over${params.instructions ? `: ${params.instructions.slice(0, 160)}` : ""}`
        : "First version";

    let historyVersions = existingBefore?.historyVersions || [];
    if (existingBefore?.html) {
      const archivedVersion = existingBefore.version || 0;
      await historyRef(params.classId, params.kcId, archivedVersion).set(snapshotForHistory(existingBefore));
      historyVersions = [...historyVersions.filter((v) => v !== archivedVersion), archivedVersion];
      // Keep the undo stack bounded
      while (historyVersions.length > MAX_HISTORY) {
        const dropped = historyVersions.shift()!;
        await historyRef(params.classId, params.kcId, dropped).delete().catch(() => null);
      }
    }

    const stored: StoredSimulation = {
      ...parsed,
      status: "ready",
      version,
      modelUsed,
      // Edits keep the original design brief; only create/rebuild replaces it
      instructions: mode === "edit" ? existingBefore?.instructions || "" : params.instructions || "",
      createdBy: params.userId,
      editLog: appendLog(existingBefore?.editLog, { version, kind, note, at: new Date().toISOString() }),
      historyVersions,
      error: undefined,
    };
    await ref.set({ ...stored, error: null, generationStartedAt: null, updatedAt: Timestamp.now() });
    return { ...stored, updatedAt: Timestamp.now() };
  } catch (err) {
    await releaseWithFailure(err instanceof ApiError ? err.message : "Simulation generation failed.");
    throw err;
  }
}

/** Restores the most recently archived version (one step back). No AI call, instant. */
export async function undoSimulation(params: { classId: string; kcId: string; userId: string }): Promise<StoredSimulation> {
  const ref = simulationRef(params.classId, params.kcId);

  return adminDb().runTransaction(async (t) => {
    const curSnap = await t.get(ref);
    const current = curSnap.exists ? (curSnap.data() as StoredSimulation) : null;
    if (current?.status === "generating" && current.generationStartedAt && Date.now() - current.generationStartedAt.toMillis() < GENERATION_LOCK_MS) {
      throw new ApiError(409, "SIM_GENERATING", "Wait for the current change to finish before undoing.");
    }
    const stack = [...(current?.historyVersions || [])];
    const prevVersion = stack.pop();
    if (prevVersion === undefined) {
      throw new ApiError(404, "NO_HISTORY", "There is no earlier version to go back to.");
    }
    const prevRef = historyRef(params.classId, params.kcId, prevVersion);
    const prevSnap = await t.get(prevRef);
    if (!prevSnap.exists) {
      throw new ApiError(409, "NO_HISTORY", "That version is no longer available.");
    }
    const p = prevSnap.data() as Omit<StoredSimulation, "checkQuestion"> & { checkQuestion: StoredSimulation["checkQuestion"] | null };
    // Version numbers only move forward so students' evidence stays traceable
    const version = (current?.version || p.version) + 1;
    const restored: StoredSimulation = {
      html: p.html,
      title: p.title,
      goal: p.goal,
      howTo: p.howTo || [],
      concepts: p.concepts || [],
      checkQuestion: p.checkQuestion || null,
      status: "ready",
      version,
      modelUsed: p.modelUsed,
      instructions: p.instructions || "",
      createdBy: params.userId,
      historyVersions: stack,
      editLog: appendLog(current?.editLog, {
        version,
        kind: "undo",
        note: `Went back to version ${p.version}`,
        at: new Date().toISOString(),
      }),
    };
    t.set(ref, { ...restored, error: null, generationStartedAt: null, updatedAt: Timestamp.now() });
    // Pop the stack: undoing again goes one further back
    t.delete(prevRef);
    return restored;
  });
}
