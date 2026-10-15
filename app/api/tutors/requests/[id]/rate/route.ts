import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { trackProgress } from "@/lib/game/progress";
import { startOfUtcDay } from "@/lib/community/util";
import { TUTOR_LIMITS, validRating, xpEligible, xpForRating } from "@/lib/tutors/rules";

export const runtime = "nodejs";

const schema = z.object({ rating: z.number().int().min(1).max(5), review: z.string().trim().max(TUTOR_LIMITS.review).optional() });

/** The requester rates the answer once. The tutor earns XP, capped per day and per pair to stop rating farms. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { rating, review } = await parseJson(req, schema);
    if (!validRating(rating)) throw new ApiError(400, "VALIDATION", "Rating must be 1 to 5.");
    const ref = adminDb().collection("tutorRequests").doc(id);

    // XP anti-abuse counts are read before the transaction (cheap, bounded, single-field queries)
    const pre = await ref.get();
    if (!pre.exists) throw new ApiError(404, "NOT_FOUND", "Request not found");
    const tutorUid = pre.data()!.answeredByUid as string | null;
    let eligible = false;
    if (tutorUid) {
      const recent = await adminDb().collection("tutorRequests").where("answeredByUid", "==", tutorUid).limit(200).get();
      const now = Date.now();
      const today = startOfUtcDay(now);
      const paid = recent.docs.map((d) => d.data()).filter((r) => r.xpAwarded === true);
      const paidToday = paid.filter((r) => (r.ratedAt?.toMillis?.() || 0) >= today).length;
      const pair = paid.filter((r) => r.requesterUid === caller.uid && (r.ratedAt?.toMillis?.() || 0) >= now - 7 * 86400_000).length;
      eligible = xpEligible(paidToday, pair);
    }

    const result = await adminDb().runTransaction(async (t) => {
      const s = await t.get(ref);
      const r = s.data()!;
      if (r.requesterUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "Only the person who asked can rate.");
      if (r.status === "rated") throw new ApiError(409, "CONFLICT", "You already rated this answer.");
      if (r.status !== "answered" || !r.answeredByUid) throw new ApiError(400, "VALIDATION", "Wait for an answer first.");
      if (r.answeredByUid === caller.uid) throw new ApiError(400, "VALIDATION", "You can't rate yourself.");
      const pref = adminDb().collection("tutorProfiles").doc(r.answeredByUid);
      const xp = eligible ? xpForRating(rating) : 0;
      t.update(ref, { status: "rated", rating, review: review || null, ratedAt: Timestamp.now(), xpAwarded: xp > 0 });
      t.set(pref, { ratingSum: FieldValue.increment(rating), ratingCount: FieldValue.increment(1), answered: FieldValue.increment(1), xpEarned: FieldValue.increment(xp) }, { merge: true });
      return { tutorUid: r.answeredByUid as string, xp };
    });
    if (result.xp > 0) {
      await trackProgress({ uid: result.tutorUid, xpToAward: result.xp, stats: { peerHelps: 1 }, reason: "tutor_rated" });
    }
    await notify(result.tutorUid, { type: "system", title: `You got a ${rating}-star rating`, body: review || (result.xp ? `+${result.xp} XP for helping` : ""), href: "/tutors?tab=incoming", icon: "⭐", actorUid: caller.uid });
    await bumpChannels(["tutors"]);
    return NextResponse.json({ ok: true, data: { rated: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
