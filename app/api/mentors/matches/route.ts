import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { getPublicProfiles } from "@/lib/social/profile";
import { findMatches } from "@/lib/mentors/matching";
import { requestsFor, toMentorProfile } from "@/lib/mentors/server";

export const runtime = "nodejs";

/** Suggested matches for the caller, with reasons. Skips people already in an open or accepted request. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const meSnap = await adminDb().collection("mentorProfiles").doc(caller.uid).get();
    if (!meSnap.exists || !meSnap.data()!.active) return NextResponse.json({ ok: true, data: { matches: [], hasProfile: meSnap.exists } });
    const me = toMentorProfile(meSnap.data()!);
    const opposite = me.role === "mentor" ? "mentee" : "mentor";
    const [snap, reqs] = await Promise.all([adminDb().collection("mentorProfiles").where("role", "==", opposite).limit(300).get(), requestsFor(caller.uid)]);
    const busy = new Set<string>();
    reqs.forEach((d) => {
      const r = d.data();
      if (r.status === "pending" || r.status === "accepted") busy.add(r.fromUid === caller.uid ? r.toUid : r.fromUid);
    });
    const docs = snap.docs.filter((d) => d.data().active);
    const matches = findMatches(me, docs.map((d) => toMentorProfile(d.data())), 20, busy);
    const profiles = await getPublicProfiles(matches.map((m) => m.uid));
    const bios = new Map(docs.map((d) => [d.id, String(d.data().bio || "")]));
    return NextResponse.json({
      ok: true,
      data: {
        hasProfile: true,
        matches: matches.map((m) => {
          const p = profiles.get(m.uid);
          const other = docs.find((d) => d.id === m.uid)!.data();
          return { ...m, displayName: p?.displayName || "Learner", username: p?.username || null, photoURL: p?.photoURL || null, level: other.level, subjects: other.subjects || [], bio: bios.get(m.uid) || "" };
        }),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
