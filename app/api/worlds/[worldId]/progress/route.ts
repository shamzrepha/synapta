import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { trackProgress } from "@/lib/game/progress";
import { applyResult, kuState } from "@/lib/worlds/memory";
import { canPlay, cardId, loadCards, loadProgress, loadUnits, progressRef, saveCards } from "@/lib/worlds/play";
import { now } from "@/lib/worlds/store";

export const runtime = "nodejs";

const schema = z.object({
  nodeId: z.string().min(1).max(100).optional(),
  results: z
    .array(
      z.object({
        kuId: z.string().min(1).max(100),
        template: z.enum(["flip_recall", "cloze", "mcq", "ordering", "matching", "image_identify"]),
        correct: z.boolean(),
        firstTry: z.boolean(),
        ms: z.number().int().min(0).max(600_000),
        hintsUsed: z.number().int().min(0).max(10),
        selfRating: z.enum(["again", "hard", "good", "easy"]).optional(),
      })
    )
    .min(1)
    .max(80),
});

/** Records what happened in a lesson or a review: updates each fact's memory card (FSRS), the lesson's completion and XP. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    const { ok } = await canPlay(user.uid, worldId);
    if (!ok) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
    const body = await parseJson(req, schema);

    // only the first answer to a fact in a session counts as a memory test: the retries are practice
    const firstByKu = new Map<string, (typeof body.results)[number]>();
    for (const r of body.results) if (!firstByKu.has(r.kuId)) firstByKu.set(r.kuId, r);
    const units = await loadUnits(worldId, [...firstByKu.keys()]);
    const valid = new Set(units.map((u) => u.id));
    const cards = await loadCards(user.uid, worldId);
    const updated = [...firstByKu.values()].filter((r) => valid.has(r.kuId)).map((r) => applyResult(cards.get(r.kuId) ?? null, worldId, r));
    await saveCards(user.uid, worldId, updated);

    const logs = adminDb().batch();
    for (const r of firstByKu.values()) if (valid.has(r.kuId)) logs.set(adminDb().collection("users").doc(user.uid).collection("reviewLogs").doc(), { worldId, kuId: r.kuId, template: r.template, correct: r.correct, ms: r.ms, ts: now() });
    await logs.commit();

    const progress = await loadProgress(user.uid, worldId);
    let bonus = 0;
    if (body.nodeId && !progress.nodes[body.nodeId]?.done) {
      progress.nodes[body.nodeId] = { done: true, at: new Date().toISOString() };
      bonus = 15;
    }
    const correctCount = updated.length ? [...firstByKu.values()].filter((r) => r.correct).length : 0;
    const xp = Math.min(60, correctCount * 2) + bonus;
    progress.xp += xp;
    progress.lastActiveAt = new Date().toISOString();
    await progressRef(user.uid, worldId).set(progress);
    if (xp > 0) await trackProgress({ uid: user.uid, xpToAward: xp, stats: { flashcards: updated.length }, countsForQuests: true, reason: "SunRoot Worlds" });

    const states = Object.fromEntries(updated.map((c) => [c.kuId, kuState(c)]));
    void cardId;
    return NextResponse.json({ ok: true, data: { xpGained: xp, nodeDone: !!(body.nodeId && progress.nodes[body.nodeId]?.done), states } });
  } catch (error) {
    return handleAuthError(error);
  }
}
