import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { getPublicProfiles } from "@/lib/social/profile";
import { averageRating, subjectsOverlap, tutorScore } from "@/lib/tutors/rules";

export const runtime = "nodejs";

/** GET /api/tutors?view=browse|leaderboard&subject= — active tutor profiles with public info only. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const view = req.nextUrl.searchParams.get("view") || "browse";
    const subject = (req.nextUrl.searchParams.get("subject") || "").trim().toLowerCase();
    const snap = await adminDb().collection("tutorProfiles").where("active", "==", true).limit(200).get();
    let rows = snap.docs.map((d) => d.data());
    if (subject) rows = rows.filter((r) => subjectsOverlap((r.subjects as string[]) || [], subject));
    const profiles = await getPublicProfiles(rows.map((r) => r.uid));
    let tutors = rows.map((r) => {
      const p = profiles.get(r.uid);
      return {
        uid: r.uid as string,
        displayName: p?.displayName || "Learner",
        username: p?.username || null,
        photoURL: p?.photoURL || null,
        subjects: (r.subjects as string[]) || [],
        bio: String(r.bio || ""),
        availability: String(r.availability || ""),
        answered: r.answered || 0,
        ratingCount: r.ratingCount || 0,
        rating: averageRating(r.ratingSum || 0, r.ratingCount || 0),
        score: tutorScore(r.ratingSum || 0, r.ratingCount || 0),
        xpEarned: r.xpEarned || 0,
        isMe: r.uid === caller.uid,
      };
    });
    tutors = view === "leaderboard"
      ? tutors.sort((a, b) => b.xpEarned - a.xpEarned || b.score - a.score).slice(0, 25)
      : tutors.sort((a, b) => b.score - a.score);
    return NextResponse.json({ ok: true, data: { tutors } });
  } catch (error) {
    return handleAuthError(error);
  }
}
