import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/** Saved lesson plans of one class (teacher/admin of that class only). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const classId = new URL(req.url).searchParams.get("classId");
    if (!classId) throw new ApiError(400, "VALIDATION", "classId is required");
    await assertClassAccess(caller, classId, "mutate");
    const snap = await adminDb().collection("lessonPlans").where("classId", "==", classId).limit(100).get();
    const plans = snap.docs
      .map((d) => {
        const { syllabus: _s, ...rest } = d.data();
        void _s;
        return rest;
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return NextResponse.json({ ok: true, data: plans });
  } catch (error) {
    return handleAuthError(error);
  }
}
