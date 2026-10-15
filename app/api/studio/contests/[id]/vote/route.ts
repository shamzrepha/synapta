import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { isClosed } from "@/lib/studio/contest";
import { closeIfDue, contestsCol } from "@/lib/studio/contest-server";

export const runtime = "nodejs";

const schema = z.object({ entryUid: z.string().min(1).max(128) });

/** One vote per user, not for your own entry, only while the contest is open. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_contest_vote", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { entryUid } = await parseJson(req, schema);
    if (entryUid === caller.uid) throw new ApiError(400, "OWN_ENTRY", "You can't vote for your own entry.");
    const ref = contestsCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Contest not found");
    const c = (await closeIfDue(id)) || snap.data()!;
    if (isClosed({ status: c.status, deadline: c.deadline }, Date.now())) throw new ApiError(409, "CLOSED", "Voting has ended.");
    const entryRef = ref.collection("entries").doc(entryUid);
    const voteRef = ref.collection("votes").doc(caller.uid);
    await adminDb().runTransaction(async (t) => {
      const [e, v] = await Promise.all([t.get(entryRef), t.get(voteRef)]);
      if (!e.exists) throw new ApiError(404, "NOT_FOUND", "Entry not found");
      if (v.exists) throw new ApiError(409, "ALREADY_VOTED", "You have already used your vote.");
      t.set(voteRef, { entryUid, createdAt: Timestamp.now() });
      t.update(entryRef, { votes: FieldValue.increment(1) });
    });
    return NextResponse.json({ ok: true, data: { voted: entryUid } });
  } catch (error) {
    return handleAuthError(error);
  }
}
