import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadEvent, statusOf, eventChannels } from "@/lib/events/store";
import { getPublicProfiles } from "@/lib/social/profile";
import { bumpChannels } from "@/lib/live/server";
import { trackProgress } from "@/lib/game/progress";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const { ref, ev, canParticipate } = await loadEvent(caller, eventId);
    if (!canParticipate) throw new ApiError(403, "FORBIDDEN", "Join the class to take part.");
    const status = statusOf(ev);
    if (status !== "upcoming" && status !== "live") throw new ApiError(409, "CLOSED", "This challenge is closed.");

    const p = (await getPublicProfiles([caller.uid])).get(caller.uid);
    const entryRef = ref.collection("entries").doc(caller.uid);
    const created = await adminDb().runTransaction(async (t) => {
      const e = await t.get(entryRef);
      if (e.exists) return false;
      t.set(entryRef, {
        uid: caller.uid,
        displayName: p?.displayName || "Learner",
        photoURL: p?.photoURL || null,
        level: p?.level || 1,
        joinedAt: Timestamp.now(),
        score: 0,
        votes: 0,
        correct: 0,
        answered: 0,
        streak: 0,
        currentIndex: 0,
      });
      t.update(ref, { participantCount: FieldValue.increment(1) });
      return true;
    });
    if (created) {
      await trackProgress({ uid: caller.uid, stats: { eventsJoined: 1 }, reason: "event_join" });
      await bumpChannels(eventChannels(eventId, ev));
    }
    return NextResponse.json({ ok: true, data: { joined: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
