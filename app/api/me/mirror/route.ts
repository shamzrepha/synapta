import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildMirrorProfile } from "@/lib/mirror/profile";
import { FormatSchema, MAX_INTERESTS } from "@/lib/mirror/schema";
import { loadMirror, patchMirror } from "@/lib/mirror/store";
import { summaryFor } from "@/lib/mirror/summary-run";

export const runtime = "nodejs";

/** What the learner sees on "My learning map": the tree, their editable preferences, and a short summary. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mirror-get", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const now = Date.now();
    const state = await loadMirror(caller.uid);
    const profile = buildMirrorProfile(state, now);
    const summary = await summaryFor(caller.uid, state, profile, now);
    return NextResponse.json({ ok: true, data: { personalise: state.personalise, prefs: state.prefs, profile, summary, totalSignals: Math.round(state.totalSignals) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const patchSchema = z.object({
  personalise: z.boolean().optional(),
  prefs: z
    .object({
      formats: z.record(FormatSchema, z.enum(["more", "less"])).optional(),
      pace: z.enum(["quick", "steady", "deep"]).nullable().optional(),
      examples: z.enum(["short", "long"]).nullable().optional(),
      encouragement: z.enum(["low", "medium", "high"]).nullable().optional(),
      interests: z.array(z.string().trim().min(1).max(40)).max(MAX_INTERESTS).optional(),
      dailyGoalItems: z.number().int().min(1).max(20).optional(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mirror-patch", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, patchSchema);
    const state = await patchMirror(caller.uid, { personalise: body.personalise, prefs: body.prefs });
    const profile = buildMirrorProfile(state, Date.now());
    return NextResponse.json({ ok: true, data: { personalise: state.personalise, prefs: state.prefs, profile } });
  } catch (error) {
    return handleAuthError(error);
  }
}
