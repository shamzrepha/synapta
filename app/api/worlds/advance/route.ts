import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { advanceJob } from "@/lib/worlds/pipeline";
import { col } from "@/lib/worlds/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Does one bounded step of a build job (spec 17.1). Safe to call again and again; two calls never work on the same job at once. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: user.uid, keyPrefix: "worlds-advance", limit: 120, windowMs: 60_000 });
    if (limited) return limited;
    const { jobId } = await parseJson(req, z.object({ jobId: z.string().min(1).max(128) }));
    const snap = await col.jobs().doc(jobId).get();
    if (!snap.exists || snap.data()?.ownerUid !== user.uid) throw new ApiError(404, "NOT_FOUND", "That job was not found.");
    const { job, more } = await advanceJob(jobId);
    return NextResponse.json({
      ok: true,
      data: {
        more,
        status: job?.status ?? "running",
        stage: job?.stage ?? "extract",
        stageLabel: job?.stageLabel,
        done: job?.done?.length ?? 0,
        total: job?.plan?.length ?? 0,
        skipped: job?.skipped?.length ?? 0,
        error: job?.error ?? null,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
