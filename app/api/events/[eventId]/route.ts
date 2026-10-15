import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { loadEvent, serializeEvent, finalizeEvent, statusOf, toDate, eventChannels } from "@/lib/events/store";
import { bumpChannels } from "@/lib/live/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    let { ref, ev, canManage, canParticipate } = await loadEvent(caller, eventId);

    // Lazily close out events nobody finalized yet
    if (!ev.finalized && statusOf(ev) === "ended") {
      await finalizeEvent(eventId);
      ({ ref, ev, canManage, canParticipate } = await loadEvent(caller, eventId));
    }

    const isHack = ev.kind === "hackathon";
    const [mineSnap, boardSnap, voteSnap] = await Promise.all([
      ref.collection("entries").doc(caller.uid).get(),
      isHack
        ? ref.collection("entries").orderBy("votes", "desc").limit(100).get()
        : ref.collection("entries").orderBy("score", "desc").limit(50).get(),
      isHack ? ref.collection("votes").doc(caller.uid).get() : Promise.resolve(null),
    ]);

    const board = boardSnap.docs
      .map((d) => d.data())
      .filter((e) => (isHack ? !!e.submittedAt : true))
      .map((e, i) => ({
        rank: i + 1,
        uid: e.uid,
        displayName: e.displayName,
        photoURL: e.photoURL || null,
        level: e.level || 1,
        score: isHack ? e.votes || 0 : e.score || 0,
        correct: e.correct || 0,
        answered: e.answered || 0,
        finished: !!e.finishedAt,
        // Hackathon submission details
        title: e.title || null,
        summary: e.summary || null,
        link: e.link || null,
        repoLink: e.repoLink || null,
        submittedAt: e.submittedAt ? toDate(e.submittedAt).toISOString() : null,
        isMe: e.uid === caller.uid,
      }));

    const mine = mineSnap.exists ? mineSnap.data()! : null;
    return NextResponse.json({
      ok: true,
      data: {
        event: serializeEvent(eventId, ev),
        canManage,
        canParticipate,
        joined: !!mine,
        me: mine
          ? {
              score: mine.score || 0,
              correct: mine.correct || 0,
              answered: mine.answered || 0,
              streak: mine.streak || 0,
              currentIndex: mine.currentIndex || 0,
              finished: !!mine.finishedAt,
              submission: mine.submittedAt
                ? { title: mine.title, summary: mine.summary, link: mine.link, repoLink: mine.repoLink || null }
                : null,
            }
          : null,
        myVote: voteSnap && voteSnap.exists ? voteSnap.data()!.entryUid : null,
        board,
        serverNow: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Host/admin cancels an event that hasn't finished. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const { ref, ev, canManage } = await loadEvent(caller, eventId);
    if (!canManage) throw new ApiError(403, "FORBIDDEN", "Only the host can cancel this challenge.");
    if (ev.finalized) throw new ApiError(409, "FINALIZED", "Finished challenges can't be deleted.");
    await adminDb().recursiveDelete(ref);
    await bumpChannels(eventChannels(eventId, ev));
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
