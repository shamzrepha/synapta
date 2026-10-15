import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { iso, countLinks } from "@/lib/community/util";
import { canRequestTutor, subjectsOverlap, TUTOR_LIMITS } from "@/lib/tutors/rules";

export const runtime = "nodejs";

/**
 * GET /api/tutors/requests?view=mine|incoming
 * mine: requests I made. incoming: requests addressed to me, plus open general requests in my subjects.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const view = req.nextUrl.searchParams.get("view") || "mine";
    const col = adminDb().collection("tutorRequests");
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (view === "incoming") {
      const mine = await adminDb().collection("tutorProfiles").doc(caller.uid).get();
      const subjects: string[] = (mine.data()?.subjects as string[]) || [];
      const [direct, answeredByMe, open] = await Promise.all([
        col.where("tutorUid", "==", caller.uid).limit(100).get(),
        col.where("answeredByUid", "==", caller.uid).limit(100).get(),
        mine.exists && mine.data()?.active ? col.where("status", "==", "open").limit(200).get() : Promise.resolve(null),
      ]);
      const seen = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      direct.docs.forEach((d) => seen.set(d.id, d));
      answeredByMe.docs.forEach((d) => seen.set(d.id, d));
      open?.docs.forEach((d) => {
        const r = d.data();
        if (r.requesterUid !== caller.uid && !r.tutorUid && subjectsOverlap(subjects, r.subject)) seen.set(d.id, d);
      });
      docs = Array.from(seen.values());
    } else {
      docs = (await col.where("requesterUid", "==", caller.uid).limit(100).get()).docs;
    }
    docs.sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0));
    const uids = docs.flatMap((d) => [d.data().requesterUid, d.data().tutorUid, d.data().answeredByUid]).filter(Boolean) as string[];
    const profiles = await getPublicProfiles(uids);
    const who = (uid?: string | null) => {
      const p = uid ? profiles.get(uid) : null;
      return p ? { uid: p.uid, displayName: p.displayName, photoURL: p.photoURL } : null;
    };
    const requests = docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        subject: r.subject as string,
        question: r.question as string,
        status: r.status as "open" | "answered" | "rated",
        answer: (r.answer as string) || null,
        rating: (r.rating as number) || null,
        review: (r.review as string) || null,
        requester: who(r.requesterUid),
        tutor: who(r.answeredByUid || r.tutorUid),
        requestedTutor: !!r.tutorUid,
        iAmRequester: r.requesterUid === caller.uid,
        createdAt: iso(r.createdAt),
        answeredAt: iso(r.answeredAt),
      };
    });
    return NextResponse.json({ ok: true, data: { requests } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  subject: z.string().trim().min(2).max(40),
  question: z.string().trim().min(10).max(TUTOR_LIMITS.question),
  tutorUid: z.string().max(128).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "tutor_request", limit: 8, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    if (countLinks(body.question) > 2) throw new ApiError(400, "VALIDATION", "At most 2 links allowed.");
    if (!canRequestTutor(caller.uid, body.tutorUid)) throw new ApiError(400, "VALIDATION", "You can't tutor yourself.");
    if (body.tutorUid) {
      const t = await adminDb().collection("tutorProfiles").doc(body.tutorUid).get();
      if (!t.exists || !t.data()!.active) throw new ApiError(404, "NOT_FOUND", "That tutor isn't available.");
    }
    const ref = adminDb().collection("tutorRequests").doc();
    await ref.set({
      id: ref.id,
      requesterUid: caller.uid,
      tutorUid: body.tutorUid || null,
      subject: body.subject.toLowerCase(),
      question: body.question,
      status: "open",
      answer: null,
      answeredByUid: null,
      rating: null,
      review: null,
      createdAt: Timestamp.now(),
    });
    if (body.tutorUid) {
      await notify(body.tutorUid, { type: "system", title: "A classmate asked for your help", body: body.question.slice(0, 100), href: "/tutors?tab=incoming", icon: "🤝", actorUid: caller.uid });
    }
    await bumpChannels(["tutors"]);
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
