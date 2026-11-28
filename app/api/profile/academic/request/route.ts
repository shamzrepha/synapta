import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkAcademic } from "@/lib/academic/academic";
import { readAcademic } from "@/lib/academic/server";

export const runtime = "nodejs";

const body = z.object({
  institutionId: z.string().trim().max(40).nullable().optional(),
  unlisted: z.boolean().optional(),
  institution: z.string().trim().max(100).default(""),
  school: z.string().trim().max(120).optional(),
  department: z.string().trim().max(100),
  level: z.number().int().min(100).max(600),
  reason: z.string().trim().min(5).max(300),
});

/** A student asks to change a locked school, department or level (for example, they chose wrongly). An admin decides. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "academic_request", limit: 3, windowMs: 24 * 60 * 60 * 1000, shared: true });
    if (limited) return limited;
    const b = await parseJson(req, body);
    const current = readAcademic((await adminDb().collection("users").doc(caller.uid).get()).data());
    if (!current) throw new ApiError(400, "NOT_SET", "Set your course first.");
    const c = checkAcademic({ institutionId: b.institutionId ?? null, institution: b.institution ?? "", school: b.school, department: b.department, level: b.level, unlisted: b.unlisted });
    if (!c.ok) throw new ApiError(400, "BAD_ACADEMIC", c.message);
    await adminDb().collection("academicChangeRequests").doc(caller.uid).set({
      uid: caller.uid,
      email: caller.email || "",
      from: { institution: current.institution, school: current.school, department: current.department, level: current.level },
      to: c.value,
      reason: b.reason,
      status: "pending",
      createdAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, data: { pending: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
