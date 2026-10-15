import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { cleanSubjects } from "@/lib/community/util";
import { TUTOR_LIMITS } from "@/lib/tutors/rules";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const s = await adminDb().collection("tutorProfiles").doc(caller.uid).get();
    const d = s.data();
    return NextResponse.json({
      ok: true,
      data: {
        profile: d
          ? { subjects: d.subjects || [], bio: d.bio || "", availability: d.availability || "", active: !!d.active, answered: d.answered || 0, ratingCount: d.ratingCount || 0, ratingSum: d.ratingSum || 0, xpEarned: d.xpEarned || 0 }
          : null,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  subjects: z.array(z.string()).max(12),
  bio: z.string().trim().max(TUTOR_LIMITS.bio).default(""),
  availability: z.string().trim().max(TUTOR_LIMITS.availability).default(""),
  active: z.boolean().default(true),
});

export async function PUT(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "tutor_profile", limit: 20, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const subjects = cleanSubjects(body.subjects);
    if (subjects.length === 0) throw new ApiError(400, "VALIDATION", "Add at least one subject you can help with.");
    const ref = adminDb().collection("tutorProfiles").doc(caller.uid);
    const existing = await ref.get();
    await ref.set(
      {
        uid: caller.uid,
        subjects,
        bio: body.bio,
        availability: body.availability,
        active: body.active,
        updatedAt: Timestamp.now(),
        ...(existing.exists ? {} : { createdAt: Timestamp.now(), answered: 0, ratingSum: 0, ratingCount: 0, xpEarned: 0 }),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, data: { saved: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
