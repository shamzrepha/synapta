import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadEvent, statusOf } from "@/lib/events/store";
import { bumpChannel } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ entryUid: z.string().min(1) });

/** One vote per person per hackathon (can be moved, not on your own project). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const { entryUid } = await parseJson(req, schema);
    const { ref, ev, canParticipate } = await loadEvent(caller, eventId);
    if (ev.kind !== "hackathon") throw new ApiError(400, "BAD_KIND", "Not a hackathon.");
    if (!canParticipate) throw new ApiError(403, "FORBIDDEN", "Join the class to vote.");
    const status = statusOf(ev);
    if (status !== "live" && status !== "voting") throw new ApiError(409, "CLOSED", "Voting is closed.");
    if (entryUid === caller.uid) throw new ApiError(400, "OWN_ENTRY", "You can't vote for your own project.");

    const voteRef = ref.collection("votes").doc(caller.uid);
    const targetRef = ref.collection("entries").doc(entryUid);
    await adminDb().runTransaction(async (t) => {
      const [vote, target] = await Promise.all([t.get(voteRef), t.get(targetRef)]);
      if (!target.exists || !target.data()!.submittedAt) throw new ApiError(404, "NOT_FOUND", "That submission doesn't exist.");
      const prev = vote.exists ? (vote.data()!.entryUid as string) : null;
      if (prev === entryUid) return;
      if (prev) t.update(ref.collection("entries").doc(prev), { votes: FieldValue.increment(-1) });
      t.update(targetRef, { votes: FieldValue.increment(1) });
      t.set(voteRef, { entryUid, at: Timestamp.now() });
    });
    await bumpChannel(`event:${eventId}`);
    return NextResponse.json({ ok: true, data: { votedFor: entryUid } });
  } catch (error) {
    return handleAuthError(error);
  }
}
