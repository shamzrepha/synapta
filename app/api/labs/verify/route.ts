import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { verifyLab } from "@/lib/labs/verify";
import { applyEvidence } from "@/lib/evidence/apply";
import { z } from "zod";

export const runtime = "nodejs";

const labVerifySchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  labType: z.string().min(1),
  parameters: z.record(z.any()),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = labVerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION",
            message: parsed.error.issues[0]?.message || "Invalid lab verification payload",
          },
        },
        { status: 400 }
      );
    }

    const { classId, kcId, labType, parameters } = parsed.data;

    const verification = verifyLab(labType, parameters);

    if (!verification.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VERIFICATION_FAILED",
            message: verification.detail,
          },
          data: {
            success: false,
            detail: verification.detail,
            parameters: verification.parameters,
          },
        },
        { status: 422 }
      );
    }

    // Apply evidence atomically
    const evidenceResult = await applyEvidence({
      uid: caller.uid,
      classId,
      kcId,
      activity: "lab",
      correct: true,
      metadata: {
        labType,
        ...verification.parameters,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        success: true,
        detail: verification.detail,
        ...evidenceResult,
      },
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "LAB_RATE_LIMITED"
    ) {
      const err = error as { code: string; message: string; status?: number };
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message } },
        { status: err.status || 429 }
      );
    }
    return handleAuthError(error);
  }
}
