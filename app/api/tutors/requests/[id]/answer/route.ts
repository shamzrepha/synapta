import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { TUTOR_LIMITS } from "@/lib/tutors/rules";

export const runtime = "nodejs";

const schema = z.object({ answer: z.string().trim().min(5).max(TUTOR_LIMITS.answer) });

/** An active tutor (not the requester) answers an open request; the first answer wins. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "tutor_answer", limit: 30, windowMs: 3600_000 });
    if (limited) return limited;
    const { answer } = await parseJson(req, schema);
    const profile = await adminDb().collection("tutorProfiles").doc(caller.uid).get();
    if (!profile.exists || !profile.data()!.active) throw new ApiError(403, "FORBIDDEN", "Create an active tutor profile first.");
    const ref = adminDb().collection("tutorRequests").doc(id);
    const requesterUid = await adminDb().runTransaction(async (t) => {
      const s = await t.get(ref);
      if (!s.exists) throw new ApiError(404, "NOT_FOUND", "Request not found");
      const r = s.data()!;
      if (r.requesterUid === caller.uid) throw new ApiError(400, "VALIDATION", "You can't tutor yourself.");
      if (r.tutorUid && r.tutorUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "This request was sent to another tutor.");
      if (r.status !== "open") throw new ApiError(409, "CONFLICT", "This request has already been answered.");
      t.update(ref, { status: "answered", answer, answeredByUid: caller.uid, answeredAt: Timestamp.now() });
      return r.requesterUid as string;
    });
    await notify(requesterUid, { type: "system", title: "Your tutoring question was answered", body: answer.slice(0, 100), href: "/tutors?tab=mine", icon: "🤝", actorUid: caller.uid });
    await bumpChannels(["tutors"]);
    return NextResponse.json({ ok: true, data: { answered: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
