import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";
import { isClosed } from "@/lib/polls/logic";
import { serializePoll } from "@/lib/polls/server";

export const runtime = "nodejs";

const schema = z.object({ optionId: z.string().min(1).max(10) });

/** One vote per person, final (same data shape as feed polls: options[].votes + a pollVotes/{uid} doc). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "poll_vote", limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const { optionId } = await parseJson(req, schema);
    const ref = adminDb().collection("polls").doc(id);
    const voteRef = ref.collection("pollVotes").doc(caller.uid);
    const data = await adminDb().runTransaction(async (t) => {
      const [p, v] = await Promise.all([t.get(ref), t.get(voteRef)]);
      if (!p.exists || p.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Poll not found");
      const d = p.data()!;
      if (isClosed(d.endsAt?.toMillis?.() ?? null, Date.now())) throw new ApiError(409, "CLOSED", "This poll has closed.");
      if (v.exists) throw new ApiError(409, "ALREADY_VOTED", "You already voted on this poll.");
      const options = (d.options as { id: string; votes: number }[]).map((o) => ({ ...o }));
      if (!options.some((o) => o.id === optionId)) throw new ApiError(400, "VALIDATION", "Unknown option.");
      options.forEach((o) => o.id === optionId && (o.votes += 1));
      const totalVotes = (d.totalVotes || 0) + 1;
      t.update(ref, { options, totalVotes });
      t.set(voteRef, { optionId, at: Timestamp.now() });
      return { ...d, options, totalVotes };
    });
    await bumpChannels(["polls", `poll:${id}`]);
    return NextResponse.json({ ok: true, data: { poll: serializePoll(id, data, caller.uid, optionId) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
