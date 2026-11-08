import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { executeStructuredAiTask } from "@/lib/ai/router";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { loadKcGroundingContext } from "@/lib/kc/context";
import { buildQuestPrompt, questResponseSchema } from "./build";
import { normalizeChallenges, type Challenge } from "./schema";

const LOCK_MS = 3 * 60 * 1000;
export const MAX_QUEST_PIECES = 8;

export interface StoredQuest {
  index: number;
  objective: string;
  status: "ready" | "generating" | "failed";
  version: number;
  challenges: Challenge[];
  error?: string | null;
  createdBy?: string;
  generationStartedAt?: FirebaseFirestore.Timestamp | null;
}

const questsCol = (classId: string, kcId: string) => adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).collection("quests");
export const questRef = (classId: string, kcId: string, index: number) => questsCol(classId, kcId).doc(`q${index}`);

export async function getStoredQuests(classId: string, kcId: string): Promise<Map<number, StoredQuest>> {
  const snap = await questsCol(classId, kcId).get();
  const out = new Map<number, StoredQuest>();
  snap.forEach((d) => {
    const q = d.data() as StoredQuest;
    if (typeof q.index === "number") out.set(q.index, q);
  });
  return out;
}

export function questStatus(q: StoredQuest): StoredQuest["status"] {
  const stale = q.status === "generating" && q.generationStartedAt && Date.now() - q.generationStartedAt.toMillis() > LOCK_MS;
  return stale ? (q.challenges?.length ? "ready" : "failed") : q.status;
}

export async function generateQuest(params: { classId: string; kcId: string; index: number; userId: string }): Promise<StoredQuest> {
  const { classId, kcId, index, userId } = params;
  if (index < 0 || index >= MAX_QUEST_PIECES) throw new ApiError(400, "BAD_PIECE", "That piece does not exist.");
  const ref = questRef(classId, kcId, index);
  const ctx = await loadKcGroundingContext(classId, kcId, { materialBudget: 5000 });
  const objective = ctx.objectives[index];
  if (!objective) throw new ApiError(404, "NO_PIECE", "This topic has no learning objective at that position.");

  const before = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const existing = snap.exists ? (snap.data() as StoredQuest) : null;
    if (existing?.status === "generating" && existing.generationStartedAt && Date.now() - existing.generationStartedAt.toMillis() < LOCK_MS) {
      throw new ApiError(409, "QUEST_GENERATING", "These challenges are already being built. They will appear in a moment.");
    }
    t.set(ref, { index, objective, status: "generating", generationStartedAt: Timestamp.now(), error: null }, { merge: true });
    return existing;
  });

  try {
    await checkRateLimitAndQuota(userId, 6000);
    const prompt = buildQuestPrompt({
      kcTitle: ctx.kcTitle,
      objective,
      subject: ctx.subject,
      level: ctx.level,
      contextText: ctx.contextText,
      otherObjectives: ctx.objectives.filter((_, i) => i !== index),
    });
    let challenges: Challenge[] = [];
    for (let attempt = 0; attempt < 2 && challenges.length < 4; attempt++) {
      const { data } = await executeStructuredAiTask({
        task: "quest_build",
        systemInstruction: prompt.systemInstruction,
        userPrompt: attempt ? `${prompt.userPrompt}\n\nYour last answer had too few valid challenges. Return 7 valid ones, with solvable sliders and unique options.` : prompt.userPrompt,
        schema: questResponseSchema,
        userId,
        estimatedTokens: 4500,
        isPrivileged: true,
        learnerLanguage: false,
      });
      const next = normalizeChallenges(data.challenges);
      if (next.length > challenges.length) challenges = next;
    }
    if (challenges.length < 3) throw new ApiError(502, "QUEST_FAILED", "The AI couldn't build good challenges for this piece. Try again.");
    const stored: StoredQuest = { index, objective, status: "ready", version: (before?.version || 0) + 1, challenges, error: null, createdBy: userId, generationStartedAt: null };
    await ref.set({ ...stored, updatedAt: Timestamp.now() });
    return stored;
  } catch (err) {
    await ref
      .set({ status: before?.challenges?.length ? "ready" : "failed", error: err instanceof ApiError ? err.message : "Challenge generation failed.", updatedAt: Timestamp.now() }, { merge: true })
      .catch(() => null);
    throw err;
  }
}

/** One learner's progress in one quest: which challenges they got right on the first try. Written only by the server. */
export const runRef = (uid: string, classId: string, kcId: string, index: number) => adminDb().collection("questRuns").doc(`${uid}_${classId}_${kcId}_${index}`);

export interface QuestRun {
  uid: string;
  firstTry: Record<string, boolean>;
  solved: Record<string, boolean>;
  creditedVersion?: number;
}
