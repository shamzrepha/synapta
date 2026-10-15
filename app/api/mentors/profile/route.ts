import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { cleanSubjects } from "@/lib/community/util";
import { AVAILABILITY_SLOTS, MAX_LEVEL, MIN_LEVEL } from "@/lib/mentors/matching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const s = await adminDb().collection("mentorProfiles").doc(caller.uid).get();
    const d = s.data();
    return NextResponse.json({
      ok: true,
      data: { profile: d ? { role: d.role, subjects: d.subjects || [], level: d.level, availability: d.availability || [], bio: d.bio || "", active: !!d.active } : null },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  role: z.enum(["mentor", "mentee"]),
  subjects: z.array(z.string()).max(12),
  level: z.number().int().min(MIN_LEVEL).max(MAX_LEVEL),
  availability: z.array(z.string()).max(8).default([]),
  bio: z.string().trim().max(300).default(""),
  active: z.boolean().default(true),
});

export async function PUT(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mentor_profile", limit: 20, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const subjects = cleanSubjects(body.subjects);
    if (subjects.length === 0) throw new ApiError(400, "VALIDATION", "Pick at least one subject.");
    const allowed = new Set<string>(AVAILABILITY_SLOTS.map((s) => s.id));
    const availability = (body.availability ?? []).filter((a) => allowed.has(a));
    await adminDb().collection("mentorProfiles").doc(caller.uid).set(
      { uid: caller.uid, role: body.role, subjects, level: body.level, availability, bio: body.bio, active: body.active, updatedAt: Timestamp.now() },
      { merge: true }
    );
    return NextResponse.json({ ok: true, data: { saved: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
