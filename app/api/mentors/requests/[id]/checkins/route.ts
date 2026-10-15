import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { iso } from "@/lib/community/util";

export const runtime = "nodejs";

async function loadAccepted(id: string, uid: string) {
  const ref = adminDb().collection("mentorRequests").doc(id);
  const s = await ref.get();
  if (!s.exists) throw new ApiError(404, "NOT_FOUND", "Pairing not found");
  const r = s.data()!;
  if (r.fromUid !== uid && r.toUid !== uid) throw new ApiError(403, "FORBIDDEN", "Not your pairing.");
  if (r.status !== "accepted") throw new ApiError(409, "CONFLICT", "This pairing isn't active.");
  return { ref, r };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadAccepted(id, caller.uid);
    const snap = await ref.collection("checkins").orderBy("createdAt", "desc").limit(50).get();
    const profiles = await getPublicProfiles(snap.docs.map((d) => d.data().authorUid));
    const checkins = snap.docs.map((d) => ({
      id: d.id,
      text: d.data().text as string,
      topic: (d.data().topic as string) || "",
      authorName: profiles.get(d.data().authorUid)?.displayName || "Learner",
      mine: d.data().authorUid === caller.uid,
      createdAt: iso(d.data().createdAt),
    }));
    return NextResponse.json({ ok: true, data: { checkins } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({ text: z.string().trim().min(2).max(500), topic: z.string().trim().max(60).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mentor_checkin", limit: 20, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const { ref, r } = await loadAccepted(id, caller.uid);
    await ref.collection("checkins").add({ authorUid: caller.uid, text: body.text, topic: body.topic || "", createdAt: Timestamp.now() });
    const other = r.fromUid === caller.uid ? r.toUid : r.fromUid;
    const name = (await getPublicProfiles([caller.uid])).get(caller.uid)?.displayName || "Your mentoring partner";
    await notify(other, { type: "friend", title: `${name} logged a check-in`, body: body.text.slice(0, 100), href: "/mentors?tab=pairs", icon: "🧭", actorUid: caller.uid, actorName: name });
    return NextResponse.json({ ok: true, data: { saved: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
