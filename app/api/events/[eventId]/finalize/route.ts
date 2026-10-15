import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { Timestamp } from "@/lib/firebase/admin";
import { loadEvent, finalizeEvent, statusOf, eventChannels } from "@/lib/events/store";
import { bumpChannels } from "@/lib/live/server";

export const runtime = "nodejs";

/** Host ends the challenge early: quiz sprints finish now; hackathons close submissions, then voting. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const { ref, ev, canManage } = await loadEvent(caller, eventId);
    if (!canManage) throw new ApiError(403, "FORBIDDEN", "Only the host can end this challenge.");
    if (ev.finalized) return NextResponse.json({ ok: true, data: { finalized: true } });
    if (statusOf(ev) === "upcoming") throw new ApiError(409, "NOT_STARTED", "This challenge hasn't started yet.");
    const now = Timestamp.now();
    const status = statusOf(ev);
    if (ev.kind === "hackathon" && status === "live") {
      // First press closes submissions and opens voting; the second press ends voting
      await ref.update({ endAt: now });
      await bumpChannels(eventChannels(eventId, ev));
      return NextResponse.json({ ok: true, data: { finalized: false, stage: "voting" } });
    }
    await ref.update({ endAt: ev.kind === "hackathon" ? ev.endAt : now, ...(ev.kind === "hackathon" ? { votingEndsAt: now } : {}) });
    await finalizeEvent(eventId);
    return NextResponse.json({ ok: true, data: { finalized: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
