import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { INSTITUTIONS, LEVELS, levelNow } from "@/lib/academic/academic";
import { buildAcademic, readAcademic, saveAcademic } from "@/lib/academic/server";

export const runtime = "nodejs";

/** The student's course, the lists to choose from, and whether a change request is waiting. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("users").doc(caller.uid).get();
    const user = snap.data();
    const a = readAcademic(user);
    const pending = (await adminDb().collection("academicChangeRequests").doc(caller.uid).get()).data();
    return NextResponse.json({
      ok: true,
      data: {
        academic: a ? { ...a, level: levelNow(a) } : null,
        locked: !!a,
        pendingRequest: pending?.status === "pending",
        levels: LEVELS,
        institutions: INSTITUTIONS.map((i) => ({ id: i.id, name: i.name, maxLevel: i.maxLevel, verified: i.verified, schools: i.schools })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const body = z.object({
  institutionId: z.string().trim().max(40).nullable().optional(),
  institution: z.string().trim().max(100).default(""),
  school: z.string().trim().max(120).optional(),
  department: z.string().trim().max(100),
  level: z.number().int().min(100).max(600),
  unlisted: z.boolean().optional(),
});

/** Sets the student's course for the first time. After that it is locked: only an admin approving a change request can alter it. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "academic_set", limit: 20, windowMs: 60 * 60 * 1000, shared: true });
    if (limited) return limited;
    const b = await parseJson(req, body);
    const snap = await adminDb().collection("users").doc(caller.uid).get();
    if (readAcademic(snap.data())) throw new ApiError(409, "ACADEMIC_LOCKED", "Your school and course are locked. Send a change request and an admin will review it.");
    const r = buildAcademic({ institutionId: b.institutionId ?? null, institution: b.institution ?? "", school: b.school, department: b.department, level: b.level, unlisted: b.unlisted });
    if (!r.ok) throw new ApiError(400, "BAD_ACADEMIC", r.message);
    await saveAcademic(caller.uid, r.academic);
    if (b.unlisted) {
      // so the admin can add the department to the list
      await adminDb().collection("missingDepartments").doc(caller.uid).set({ uid: caller.uid, institution: r.academic.institution, school: r.academic.school, department: r.academic.department, level: r.academic.level, createdAt: Timestamp.now() }).catch(() => null);
    }
    return NextResponse.json({ ok: true, data: { academic: { ...r.academic, level: levelNow(r.academic) } } });
  } catch (error) {
    return handleAuthError(error);
  }
}
