import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { Timestamp } from "@/lib/firebase/admin";
import { loadDesign } from "@/lib/studio/store";
import { parseSpec } from "@/lib/studio/spec";
import { verifyStep } from "@/lib/studio/verify";
import { trackProgress } from "@/lib/game/progress";
import { shareAchievement } from "@/lib/social/feed";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const STEP_XP = 15;
const COMPLETE_XP = 50;

/**
 * Checks a guided step on the SAVED design (server-side, so XP can't be faked) and records it.
 * Verified steps earn XP once; finishing every step counts as a completed lab.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { stepId } = await parseJson(req, z.object({ stepId: z.string().min(1).max(40) }));
    const { ref, data, canEdit } = await loadDesign(id, caller);
    if (!canEdit) throw new ApiError(403, "FORBIDDEN", "Fork this design to work through its steps.");
    const spec = parseSpec(data.spec);
    const step = spec.steps.find((s) => s.id === stepId);
    if (!step) throw new ApiError(404, "NOT_FOUND", "Step not found");
    const result = verifyStep(spec, step);
    const mine: Record<string, { done: boolean; verified: boolean }> = (data.progress || {})[caller.uid] || {};
    const firstTime = result.done && !mine[stepId]?.done;
    if (result.done) {
      await ref.update({ [`progress.${caller.uid}.${stepId}`]: { done: true, verified: result.verified, at: Timestamp.now() } });
    }
    const doneNow = new Set([...Object.keys(mine).filter((k) => mine[k]?.done), ...(result.done ? [stepId] : [])]);
    const completed = spec.steps.length > 0 && spec.steps.every((s) => doneNow.has(s.id));
    const justCompleted = completed && firstTime;
    if (firstTime && result.verified) {
      await trackProgress({ uid: caller.uid, xpToAward: STEP_XP + (justCompleted ? COMPLETE_XP : 0), stats: justCompleted ? { labs: 1 } : undefined, countsForQuests: true, reason: "studio_step" });
    }
    if (justCompleted) {
      await shareAchievement(caller.uid, `built **${data.title}** in Maker Studio 🛠️`, { type: "studio", designId: id });
    }
    return NextResponse.json({ ok: true, data: { ...result, completed, xp: firstTime && result.verified ? STEP_XP + (justCompleted ? COMPLETE_XP : 0) : 0 } });
  } catch (error) {
    return handleAuthError(error);
  }
}
