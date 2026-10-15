import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannel } from "@/lib/live/server";
import { applyRsvp } from "@/lib/sessions/ics";
import { getPublicProfiles } from "@/lib/social/profile";

export const runtime = "nodejs";

const bodySchema = z.object({ status: z.enum(["going", "maybe", "none"]) });

async function loadSession(sessionId: string, caller: Awaited<ReturnType<typeof requireUser>>) {
  const ref = adminDb().collection("studySessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Session not found");
  const s = snap.data()!;
  const access = await getClassAccess(caller, s.classId);
  if (!access.isEnrolled && !access.canMutate) throw new ApiError(403, "FORBIDDEN", "Join the class first.");
  return { ref, s };
}

/** Attendee list: who is going / maybe (public profile fields only). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const caller = await requireUser(req);
    const { s } = await loadSession(sessionId, caller);
    const going: string[] = Array.isArray(s.rsvpUids) ? s.rsvpUids.slice(0, 200) : [];
    const maybe: string[] = Array.isArray(s.maybeUids) ? s.maybeUids.slice(0, 200) : [];
    const profiles = await getPublicProfiles([...going, ...maybe]);
    const pick = (uids: string[]) =>
      uids.map((u) => {
        const p = profiles.get(u);
        return { uid: u, displayName: p?.displayName || "Learner", username: p?.username || null, photoURL: p?.photoURL || null, isHost: u === s.hostUid };
      });
    return NextResponse.json({ ok: true, data: { going: pick(going), maybe: pick(maybe) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Sets the caller's RSVP: going, maybe or none. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "session_rsvp", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const { status } = await parseJson(req, bodySchema);
    const { ref, s } = await loadSession(sessionId, caller);
    if (s.hostUid === caller.uid) throw new ApiError(400, "VALIDATION", "You're hosting this session.");
    const next = await adminDb().runTransaction(async (t) => {
      const cur = await t.get(ref);
      const d = cur.data() || {};
      const r = applyRsvp(Array.isArray(d.rsvpUids) ? d.rsvpUids : [], Array.isArray(d.maybeUids) ? d.maybeUids : [], caller.uid, status);
      t.update(ref, { rsvpUids: r.going, maybeUids: r.maybe });
      return r;
    });
    await bumpChannel(`sessions:class:${s.classId}`);
    return NextResponse.json({ ok: true, data: { status, going: next.going.length, maybe: next.maybe.length } });
  } catch (error) {
    return handleAuthError(error);
  }
}
