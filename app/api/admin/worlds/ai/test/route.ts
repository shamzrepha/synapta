import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { generateStructured } from "@/lib/ai/structured/generate";
import { AiChainExhaustedError, AiRouteMissingError, TASKS } from "@/lib/ai/structured/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Runs a tiny strict-JSON job through a task's models, so the admin can see that the assignment really works. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "worlds-ai-test", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { task } = await parseJson(req, z.object({ task: z.enum(TASKS) }));
    const attempts: Array<{ modelId: string; ok: boolean; repairs: number; latencyMs: number; reason?: string }> = [];
    try {
      const r = await generateStructured({
        task,
        promptName: "ping",
        promptVars: { word: "heart" },
        schema: z.object({ word: z.string(), length: z.number() }),
        onAttempt: (a) => attempts.push({ modelId: a.modelId, ok: a.ok, repairs: a.repairs, latencyMs: a.latencyMs, reason: a.reason }),
      });
      return NextResponse.json({ ok: true, data: { passed: true, modelId: r.meta.modelId, repairs: r.meta.repairs, latencyMs: r.meta.latencyMs, attempts } });
    } catch (e) {
      if (e instanceof AiRouteMissingError || e instanceof AiChainExhaustedError) {
        return NextResponse.json({ ok: true, data: { passed: false, message: e.message, attempts } });
      }
      throw e;
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
