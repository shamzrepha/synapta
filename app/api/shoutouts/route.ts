import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { notify } from "@/lib/notifications/server";
import { trackProgress } from "@/lib/game/progress";
import { getPublicProfiles } from "@/lib/social/profile";
import { iso } from "@/lib/community/util";
import { BADGE_IDS, badgeCounts, badgeInfo, canSendShoutout, validateMessage } from "@/lib/shoutouts/rules";

export const runtime = "nodejs";

/**
 * GET /api/shoutouts?view=received|sent&uid=<userId>
 * `uid` (any user) returns that person's received shout-outs for the profile page; shout-outs are public by design
 * and expose only public profile fields of the sender.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const sp = req.nextUrl.searchParams;
    const view = sp.get("view") === "sent" ? "sent" : "received";
    const target = (sp.get("uid") || "").trim() || caller.uid;
    if (view === "sent" && target !== caller.uid) throw new ApiError(403, "FORBIDDEN", "You can only see your own sent shout-outs.");
    const field = view === "sent" ? "fromUid" : "toUid";
    const snap = await adminDb().collection("shoutouts").where(field, "==", target).limit(200).get();
    const docs = snap.docs.sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0));
    const profiles = await getPublicProfiles(docs.flatMap((d) => [d.data().fromUid, d.data().toUid]));
    const person = (uid: string) => {
      const p = profiles.get(uid);
      return { uid, displayName: p?.displayName || "Learner", username: p?.username || null, photoURL: p?.photoURL || null };
    };
    const shoutouts = docs.map((d) => {
      const s = d.data();
      const b = badgeInfo(s.badge);
      return { id: d.id, badge: b.id, badgeLabel: b.label, emoji: b.emoji, message: s.message as string, from: person(s.fromUid), to: person(s.toUid), createdAt: iso(s.createdAt) };
    });
    return NextResponse.json({ ok: true, data: { shoutouts, total: shoutouts.length, counts: badgeCounts(shoutouts) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  toUid: z.string().min(1).max(128),
  badge: z.enum(BADGE_IDS),
  message: z.string().max(1000),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "shoutout", limit: 12, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const msg = validateMessage(body.message);
    if (!msg.ok) throw new ApiError(400, "VALIDATION", msg.message);

    const to = await adminDb().collection("users").doc(body.toUid).get();
    if (!to.exists) throw new ApiError(404, "NOT_FOUND", "That user doesn't exist.");

    const mine = await adminDb().collection("shoutouts").where("fromUid", "==", caller.uid).limit(100).get();
    const sent = mine.docs.map((d) => ({ toUid: d.data().toUid as string, createdAtMs: d.data().createdAt?.toMillis?.() || 0 }));
    const check = canSendShoutout(caller.uid, body.toUid, sent, Date.now());
    if (!check.ok) throw new ApiError(check.code === "SELF" ? 400 : 429, check.code, check.message);

    const ref = adminDb().collection("shoutouts").doc();
    await ref.set({ id: ref.id, fromUid: caller.uid, toUid: body.toUid, badge: body.badge, message: msg.text, createdAt: Timestamp.now() });

    const b = badgeInfo(body.badge);
    const fromName = (await getPublicProfiles([caller.uid])).get(caller.uid)?.displayName || "Someone";
    await notify(body.toUid, { type: "badge", title: `${fromName} sent you a shout-out: ${b.label}`, body: msg.text.slice(0, 100), href: "/shoutouts?tab=received", icon: b.emoji, actorUid: caller.uid, actorName: fromName });
    await trackProgress({ uid: body.toUid, xpToAward: 5, stats: { peerHelps: 1 }, reason: "shoutout_received" });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
