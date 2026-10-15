import { iso } from "@/lib/community/util";
import { isClosed } from "./logic";

export function serializePoll(id: string, p: FirebaseFirestore.DocumentData, viewerUid: string, myVote: string | null) {
  const endsAtMs: number | null = p.endsAt?.toMillis ? p.endsAt.toMillis() : null;
  return {
    id,
    question: String(p.question || ""),
    kind: (p.kind as "poll" | "thisorthat") || "poll",
    options: ((p.options || []) as { id: string; text: string; image?: string | null; votes: number }[]).map((o) => ({
      id: o.id,
      text: o.text,
      image: o.image || null,
      votes: o.votes || 0,
    })),
    totalVotes: p.totalVotes || 0,
    commentCount: p.commentCount || 0,
    endsAt: iso(p.endsAt),
    closed: isClosed(endsAtMs, Date.now()),
    authorName: p.authorName || "Learner",
    authorPhoto: p.authorPhoto || null,
    createdAt: iso(p.createdAt),
    mine: p.authorUid === viewerUid,
    myVote,
  };
}

export type SerializedPoll = ReturnType<typeof serializePoll>;
