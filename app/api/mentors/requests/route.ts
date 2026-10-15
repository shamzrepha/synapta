import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { iso } from "@/lib/community/util";
import { scoreMatch } from "@/lib/mentors/matching";
import { pairId, requestsFor, toMentorProfile } from "@/lib/mentors/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const docs = await requestsFor(caller.uid);
    const profiles = await getPublicProfiles(docs.flatMap((d) => [d.data().mentorUid, d.data().menteeUid]));
    const person = (uid: string) => {
      const p = profiles.get(uid);
      return { uid, displayName: p?.displayName || "Learner", photoURL: p?.photoURL || null };
    };
    const requests = docs.map((d) => {
      const r = d.data();
      const otherUid = r.fromUid === caller.uid ? r.toUid : r.fromUid;
      return {
        id: d.id,
        status: r.status as "pending" | "accepted" | "declined" | "cancelled",
        message: (r.message as string) || "",
        direction: r.fromUid === caller.uid ? "sent" : "received",
        myRole: r.mentorUid === caller.uid ? "mentor" : "mentee",
        other: person(otherUid),
        chatId: (r.chatId as string) || null,
        createdAt: iso(r.createdAt),
      };
    });
    return NextResponse.json({ ok: true, data: { requests } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({ toUid: z.string().min(1).max(128), message: z.string().trim().max(300).default("") });

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mentor_request", limit: 10, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const col = adminDb().collection("mentorProfiles");
    const [meSnap, otherSnap] = await Promise.all([col.doc(caller.uid).get(), col.doc(body.toUid).get()]);
    if (!meSnap.exists || !meSnap.data()!.active) throw new ApiError(400, "VALIDATION", "Set up your mentor profile first.");
    if (!otherSnap.exists || !otherSnap.data()!.active) throw new ApiError(404, "NOT_FOUND", "That person isn't available.");
    const me = toMentorProfile(meSnap.data()!);
    const other = toMentorProfile(otherSnap.data()!);
    // re-check the match server-side so the client can't pair arbitrary users
    if (!scoreMatch(me, other)) throw new ApiError(400, "VALIDATION", "You two aren't a valid mentor and mentee match.");
    const mentorUid = me.role === "mentor" ? me.uid : other.uid;
    const menteeUid = me.role === "mentee" ? me.uid : other.uid;
    const id = pairId(me.uid, other.uid);
    const ref = adminDb().collection("mentorRequests").doc(id);
    const existing = await ref.get();
    if (existing.exists && ["pending", "accepted"].includes(existing.data()!.status)) throw new ApiError(409, "CONFLICT", "You already have a request with this person.");
    await ref.set({ id, fromUid: caller.uid, toUid: other.uid, mentorUid, menteeUid, message: body.message, status: "pending", chatId: null, createdAt: Timestamp.now() });
    const name = (await getPublicProfiles([caller.uid])).get(caller.uid)?.displayName || "Someone";
    await notify(other.uid, { type: "friend", title: `${name} wants you as their ${me.role === "mentor" ? "mentee" : "mentor"}`, body: (body.message ?? "").slice(0, 100), href: "/mentors?tab=requests", icon: "🧭", actorUid: caller.uid, actorName: name });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
