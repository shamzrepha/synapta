import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { generateWithFallback, AiGenerationError } from "@/lib/ai/router";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { loadKcGroundingContext } from "@/lib/kc/context";
import { buildSimulationPrompt, parseGeneratedSimulation, type ParsedSimulation } from "./build";

/**
 * Piece labs: every learning objective of a topic ("piece") gets its own small interactive lab,
 * stored next to the topic's main simulation at classes/{id}/kcs/{kcId}/pieces/p{index}.
 */
const LOCK_MS = 4 * 60 * 1000;
export const MAX_PIECES = 8;

export interface StoredPiece extends ParsedSimulation {
  status: "ready" | "generating" | "failed";
  index: number;
  objective: string;
  version: number;
  error?: string | null;
  createdBy?: string;
  generationStartedAt?: FirebaseFirestore.Timestamp | null;
  updatedAt?: FirebaseFirestore.Timestamp;
}

export interface ClientPiece {
  index: number;
  objective: string;
  status: StoredPiece["status"];
  html?: string;
  title?: string;
  goal?: string;
  howTo?: string[];
  concepts?: string[];
  version?: number;
  error?: string;
  checkQuestion?: { question: string; options: string[] };
}

function piecesCol(classId: string, kcId: string) {
  return adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).collection("pieces");
}

export const pieceRef = (classId: string, kcId: string, index: number) => piecesCol(classId, kcId).doc(`p${index}`);

export async function getStoredPieces(classId: string, kcId: string): Promise<Map<number, StoredPiece>> {
  const snap = await piecesCol(classId, kcId).get();
  const out = new Map<number, StoredPiece>();
  snap.forEach((d) => {
    const p = d.data() as StoredPiece;
    if (typeof p.index === "number") out.set(p.index, p);
  });
  return out;
}

/** Never ship the answer key to the browser. */
export function toClientPiece(p: StoredPiece): ClientPiece {
  const stale = p.status === "generating" && p.generationStartedAt && Date.now() - p.generationStartedAt.toMillis() > LOCK_MS;
  return {
    index: p.index,
    objective: p.objective,
    status: stale ? (p.html ? "ready" : "failed") : p.status,
    html: p.html,
    title: p.title,
    goal: p.goal,
    howTo: p.howTo,
    concepts: p.concepts,
    version: p.version,
    error: p.error || undefined,
    checkQuestion: p.checkQuestion ? { question: p.checkQuestion.question, options: p.checkQuestion.options } : undefined,
  };
}

export async function generatePieceLab(params: { classId: string; kcId: string; index: number; userId: string }): Promise<StoredPiece> {
  const { classId, kcId, index, userId } = params;
  if (index < 0 || index >= MAX_PIECES) throw new ApiError(400, "BAD_PIECE", "That piece does not exist.");
  const ref = pieceRef(classId, kcId, index);
  const ctx = await loadKcGroundingContext(classId, kcId, { materialBudget: 5000 });
  const objective = ctx.objectives[index];
  if (!objective) throw new ApiError(404, "NO_PIECE", "This topic has no learning objective at that position.");

  const before = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const existing = snap.exists ? (snap.data() as StoredPiece) : null;
    if (existing?.status === "generating" && existing.generationStartedAt && Date.now() - existing.generationStartedAt.toMillis() < LOCK_MS) {
      throw new ApiError(409, "SIM_GENERATING", "This lab is already being built. It will appear in about a minute.");
    }
    t.set(ref, { index, objective, status: "generating", generationStartedAt: Timestamp.now(), error: null }, { merge: true });
    return existing;
  });

  try {
    await checkRateLimitAndQuota(userId, 12000);
    let parsed: ParsedSimulation | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const prompt = buildSimulationPrompt({
        kcTitle: `${ctx.kcTitle}: ${objective}`,
        subject: ctx.subject,
        level: ctx.level,
        contextText: ctx.contextText,
        objectives: [objective],
        otherTopics: [...ctx.otherTopics, ...ctx.objectives.filter((_, i) => i !== index)],
        teacherInstructions:
          "This is ONE piece of a larger topic. Build a single focused experiment for exactly this learning objective (one stage only: no stage navigation). Include a prediction question before the controls unlock, 2 to 4 controls, live readouts with units, and the governing formula. Keep it compact.",
        previousError: attempt > 0 ? "Your last answer was not a complete runnable HTML document with an inline <script> and a <canvas>, <svg> or SimKit3D stage." : undefined,
      });
      const result = await generateWithFallback({
        learnerLanguage: false,
        task: "sim_build",
        systemInstruction: prompt.systemInstruction,
        userPrompt: prompt.userPrompt,
        userId,
        temperature: 0.6,
        isPrivileged: true,
      });
      parsed = parseGeneratedSimulation(result.text, objective);
    }
    if (!parsed) throw new AiGenerationError("The AI couldn't build a working lab for this piece. Try again.");
    const stored: StoredPiece = {
      ...parsed,
      status: "ready",
      index,
      objective,
      version: (before?.version || 0) + 1,
      createdBy: userId,
      error: null,
      generationStartedAt: null,
    };
    await ref.set({ ...stored, updatedAt: Timestamp.now() });
    return stored;
  } catch (err) {
    await ref
      .set({ status: before?.html ? "ready" : "failed", error: err instanceof ApiError ? err.message : "Lab generation failed.", updatedAt: Timestamp.now() }, { merge: true })
      .catch(() => null);
    throw err;
  }
}
