import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { bumpChannels } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ optionId: z.string().min(1).max(10) });

/** One vote per person per poll; changing your vote moves it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const { optionId } = await parseJson(req, schema);
    const { ref } = await loadVisiblePost(caller, postId);
    const voteRef = ref.collection("pollVotes").doc(caller.uid);
    const poll = await adminDb().runTransaction(async (t) => {
      const [p, v] = await Promise.all([t.get(ref), t.get(voteRef)]);
      const data = p.data()!;
      if (!data.poll) throw new ApiError(400, "NO_POLL", "This post has no poll.");
      if (data.poll.endsAt?.toMillis?.() < Date.now()) throw new ApiError(409, "CLOSED", "This poll has closed.");
      const options = (data.poll.options as Array<{ id: string; text: string; votes: number }>).map((o) => ({ ...o }));
      if (!options.some((o) => o.id === optionId)) throw new ApiError(400, "VALIDATION", "Unknown option.");
      const prev = v.exists ? (v.data()!.optionId as string) : null;
      if (prev === optionId) return data.poll;
      if (prev) options.forEach((o) => o.id === prev && (o.votes = Math.max(0, o.votes - 1)));
      options.forEach((o) => o.id === optionId && (o.votes += 1));
      const totalVotes = (data.poll.totalVotes || 0) + (prev ? 0 : 1);
      t.update(ref, { "poll.options": options, "poll.totalVotes": totalVotes });
      t.set(voteRef, { optionId, at: Timestamp.now() });
      return { ...data.poll, options, totalVotes };
    });
    await bumpChannels([`post:${postId}`]);
    return NextResponse.json({
      ok: true,
      data: {
        myVote: optionId,
        poll: { options: poll.options, totalVotes: poll.totalVotes, endsAt: poll.endsAt?.toDate?.().toISOString() || null, closed: false },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
