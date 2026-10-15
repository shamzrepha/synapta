import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadEvent, statusOf, eventChannels } from "@/lib/events/store";
import { bumpChannels } from "@/lib/live/server";
import { buildRulesSchema, scoreEntry } from "@/lib/studio/challenge";
import { parseSpec } from "@/lib/studio/spec";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scores the caller's current saved design for a build challenge on the server (deterministic
 * simulation) and records it. Re-submitting while live replaces the score with the new one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const { ref, ev } = await loadEvent(caller, eventId);
    if (ev.kind !== "build" || !ev.build) throw new ApiError(400, "BAD_KIND", "Not a build challenge.");
    if (statusOf(ev) !== "live") throw new ApiError(409, "NOT_LIVE", "Submissions are closed.");
    const entryRef = ref.collection("entries").doc(caller.uid);
    const entry = await entryRef.get();
    if (!entry.exists || !entry.data()!.designId) throw new ApiError(409, "NOT_JOINED", "Join the challenge first.");
    const design = await adminDb().collection("designs").doc(entry.data()!.designId).get();
    if (!design.exists || design.data()!.ownerUid !== caller.uid) throw new ApiError(404, "NOT_FOUND", "Your entry design is missing.");
    const result = scoreEntry(parseSpec(design.data()!.spec), buildRulesSchema.parse(ev.build));
    const first = !entry.data()!.submittedAt;
    await entryRef.update({
      score: result.score,
      verdict: result.verdict,
      details: result.details,
      valid: result.valid,
      commitId: design.data()!.headCommitId,
      submittedAt: first ? Timestamp.now() : entry.data()!.submittedAt,
      lastSubmittedAt: Timestamp.now(),
    });
    if (first) await ref.update({ submissionCount: FieldValue.increment(1) });
    await bumpChannels(eventChannels(eventId, ev));
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
