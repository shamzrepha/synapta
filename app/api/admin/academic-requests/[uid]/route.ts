import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { buildAcademic, saveAcademic } from "@/lib/academic/server";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";

const body = z.object({ action: z.enum(["approve", "decline"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const { uid } = await params;
    const { action } = await parseJson(req, body);
    const ref = adminDb().collection("academicChangeRequests").doc(uid);
    const snap = await ref.get();
    const r = snap.data();
    if (!snap.exists || r?.status !== "pending") throw new ApiError(404, "NOT_FOUND", "No pending request for that student.");
    if (action === "approve") {
      const to = r.to as { institutionId: string | null; institution: string; school: string; department: string; level: number };
      const built = buildAcademic({ institutionId: to.institutionId, institution: to.institution, school: to.school, department: to.department, level: to.level });
      if (!built.ok) throw new ApiError(400, "BAD_ACADEMIC", built.message);
      await saveAcademic(uid, built.academic);
    }
    await ref.set({ status: action === "approve" ? "approved" : "declined", decidedBy: admin.uid, decidedAt: Timestamp.now() }, { merge: true });
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: `academic.${action}`, targetType: "user", targetId: uid, details: { to: r.to } });
    return NextResponse.json({ ok: true, data: { status: action } });
  } catch (error) {
    return handleAuthError(error);
  }
}
