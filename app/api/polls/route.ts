import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { POLL_LIMITS, safeImage, validatePollOptions } from "@/lib/polls/logic";
import { serializePoll } from "@/lib/polls/server";

export const runtime = "nodejs";

/** GET /api/polls?status=open|closed|all — newest first, with the caller's own vote. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const status = req.nextUrl.searchParams.get("status") || "open";
    const snap = await adminDb().collection("polls").orderBy("createdAt", "desc").limit(100).get();
    const docs = snap.docs.filter((d) => !d.data().deleted);
    const refs = docs.map((d) => d.ref.collection("pollVotes").doc(caller.uid));
    const votes = refs.length ? await adminDb().getAll(...refs) : [];
    const mine = new Map(votes.filter((s) => s.exists).map((s) => [s.ref.parent.parent!.id, s.data()!.optionId as string]));
    let polls = docs.map((d) => serializePoll(d.id, d.data(), caller.uid, mine.get(d.id) || null));
    if (status === "open") polls = polls.filter((p) => !p.closed);
    else if (status === "closed") polls = polls.filter((p) => p.closed);
    return NextResponse.json({ ok: true, data: { polls } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  question: z.string().trim().min(3).max(POLL_LIMITS.question),
  kind: z.enum(["poll", "thisorthat"]).default("poll"),
  options: z.array(z.object({ text: z.string().max(200), image: z.string().max(500).optional().nullable() })).max(10),
  durationHours: z.number().int().min(1).max(POLL_LIMITS.maxHours).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "poll_create", limit: 6, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const check = validatePollOptions(body.kind ?? "poll", body.options);
    if (!check.ok) throw new ApiError(400, "VALIDATION", check.message);
    const p = (await getPublicProfiles([caller.uid])).get(caller.uid);
    const ref = adminDb().collection("polls").doc();
    await ref.set({
      id: ref.id,
      authorUid: caller.uid,
      authorName: p?.displayName || "Learner",
      authorPhoto: p?.photoURL || null,
      question: body.question,
      kind: body.kind ?? "poll",
      options: check.options.map((o, i) => ({ id: `o${i}`, text: o.text, image: (body.kind ?? "poll") === "thisorthat" ? safeImage(o.image) : null, votes: 0 })),
      totalVotes: 0,
      commentCount: 0,
      endsAt: body.durationHours ? Timestamp.fromMillis(Date.now() + body.durationHours * 3600_000) : null,
      deleted: false,
      createdAt: Timestamp.now(),
    });
    await bumpChannels(["polls"]);
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
