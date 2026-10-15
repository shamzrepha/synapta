import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { closeIfDue, contestsCol, toContestView } from "@/lib/studio/contest-server";

export const runtime = "nodejs";

/** A contest with its leaderboard. Closes itself (once) when the deadline has passed. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const ref = contestsCol().doc(id);
    const first = await ref.get();
    if (!first.exists) throw new ApiError(404, "NOT_FOUND", "Contest not found");
    const data = (await closeIfDue(id)) || first.data()!;
    const [entriesSnap, vote] = await Promise.all([ref.collection("entries").get(), ref.collection("votes").doc(caller.uid).get()]);
    const entries = entriesSnap.docs
      .map((d) => d.data())
      .map((e) => ({ uid: e.uid as string, designId: e.designId as string, title: e.title as string, ownerName: e.ownerName as string, cost: (e.cost || 0) as number, votes: (e.votes || 0) as number, createdAt: String(e.createdAt || ""), mine: e.uid === caller.uid }))
      .sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt))
      .map((e, i) => ({ ...e, rank: i + 1, winner: data.status === "closed" && e.uid === data.winnerUid }));
    return NextResponse.json({
      ok: true,
      data: { contest: toContestView(id, data), entries, myVote: vote.exists ? (vote.data()!.entryUid as string) : null, canManage: caller.uid === data.createdBy || caller.role === "admin" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
