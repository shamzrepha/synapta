import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { loadDesign } from "@/lib/studio/store";
import { studioHelp } from "@/lib/studio/design-ai";
import { parseSpec } from "@/lib/studio/spec";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  question: z.string().trim().min(1).max(2000),
  mode: z.enum(["learn", "practice", "challenge"]).default("learn"),
  /** the learner's unsaved working copy, so help matches what they see */
  spec: z.record(z.unknown()).optional(),
  history: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(6000) })).max(12).default([]),
  testResults: z.array(z.object({ title: z.string().max(200), pass: z.boolean(), message: z.string().max(500) })).max(10).default([]),
  currentStep: z.string().max(200).optional(),
});

/** Studio tutor: answers about the live design, at the hint depth the learning mode allows. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_help", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const { data } = await loadDesign(id, caller);
    let spec = parseSpec(data.spec);
    if (body.spec) {
      try {
        spec = parseSpec(body.spec);
      } catch {
        // fall back to the saved version
      }
    }
    // Challenge entries get Socratic help only, whatever the client asks for
    const mode = data.challengeId ? "challenge" : body.mode ?? "learn";
    const answer = await studioHelp({ spec, question: body.question, mode, userId: caller.uid, history: body.history, testResults: body.testResults, currentStep: body.currentStep });
    return NextResponse.json({ ok: true, data: { answer } });
  } catch (error) {
    return handleAuthError(error);
  }
}
