import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAiConfig } from "@/lib/ai/structured/config";
import { AiRouteMissingError } from "@/lib/ai/structured/types";
import { resolveChain } from "@/lib/ai/structured/config";
import { col, now } from "@/lib/worlds/store";
import { planJob, STAGE_LABELS, type JobDoc } from "@/lib/worlds/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** My worlds, newest first. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const snap = await col.worlds().where("ownerUid", "==", user.uid).orderBy("updatedAt", "desc").limit(50).get();
    const worlds = snap.docs.map((d) => {
      const w = d.data();
      return { id: d.id, title: w.title, status: w.status, subjectPackId: w.subjectPackId, themeId: w.themeId, stats: w.stats, classId: w.classId ?? null, updatedAt: w.updatedAt?.toDate?.().toISOString?.() ?? null };
    });
    return NextResponse.json({ ok: true, data: { worlds } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  docIds: z.array(z.string().min(1).max(128)).min(1).max(20),
  title: z.string().trim().min(1).max(120).optional(),
  /** add these notes to an existing world instead of making a new one */
  worldId: z.string().min(1).max(128).optional(),
  classId: z.string().min(1).max(128).optional(),
});

/**
 * "Create": makes a world from the uploaded notes (or adds them to an existing world, merging with what is there) and
 * starts the build job. The browser then calls /api/worlds/advance until it finishes, or leaves and comes back.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: user.uid, keyPrefix: "worlds-create", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const b = await parseJson(req, createSchema);

    // every note must be the caller's own
    const docs = await Promise.all(b.docIds.map((id) => col.sourceDocs().doc(id).get()));
    if (docs.some((d) => !d.exists || d.data()?.ownerUid !== user.uid)) throw new ApiError(404, "NOT_FOUND", "One of the notes was not found.");

    // the AI must be set up; tell the owner clearly instead of failing halfway
    const config = await getAiConfig();
    try {
      await resolveChain("extract", config);
    } catch (e) {
      if (e instanceof AiRouteMissingError) throw new ApiError(503, "AI_NOT_READY", "SunRoot Worlds isn't set up yet. Ask the admin to open Admin, System tab, Worlds AI models, and press \"Set up from my existing keys\".");
      throw e;
    }

    let classId = b.classId;
    if (classId) await assertClassAccess(user, classId, "mutate");

    let worldId = b.worldId;
    let docIds = b.docIds;
    if (worldId) {
      const snap = await col.worlds().doc(worldId).get();
      if (!snap.exists || snap.data()?.ownerUid !== user.uid) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
      classId = (snap.data()?.classId as string | undefined) ?? classId;
      const existing = (snap.data()?.docIds as string[] | undefined) ?? [];
      docIds = b.docIds.filter((id) => !existing.includes(id));
      if (docIds.length === 0) throw new ApiError(409, "ALREADY_ADDED", "Those notes are already in this world.");
    } else {
      const ref = col.worlds().doc();
      worldId = ref.id;
      const title = b.title || docs[0].data()?.title || "My world";
      await ref.set({ ownerUid: user.uid, classId: classId ?? null, title, subjectPackId: "general", themeId: "island", docIds: [], status: "building", stats: { kuCount: 0, conceptCount: 0, activityCount: 0, conflictCount: 0, docCount: 0 }, version: 1, createdAt: now(), updatedAt: now() });
    }
    await col.worlds().doc(worldId).set({ status: "building", updatedAt: now() }, { merge: true });

    const { plan } = await planJob(docIds);
    if (plan.length === 0) throw new ApiError(400, "EMPTY", "These notes have no readable text.");
    const jobRef = col.jobs().doc();
    const job: JobDoc = { ownerUid: user.uid, worldId, docIds, status: "queued", stage: "extract", stageLabel: STAGE_LABELS.extract, plan, done: [], attempts: {}, skipped: [], report: { dropped: 0, modelCalls: 0, unitsFound: 0, unitsAdded: 0, unitsAlreadyKnown: 0, conflicts: 0 }, createdAt: now(), updatedAt: now() };
    await jobRef.set(JSON.parse(JSON.stringify(job)));
    await col.worlds().doc(worldId).set({ activeJobId: jobRef.id }, { merge: true });
    return NextResponse.json({ ok: true, data: { worldId, jobId: jobRef.id, sections: plan.length } });
  } catch (error) {
    return handleAuthError(error);
  }
}
