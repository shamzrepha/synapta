import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { verifyLab } from "@/lib/labs/verify";
import { applyEvidenceIfEnrolled } from "@/lib/evidence/apply";
import { parseJson } from "@/lib/api/errors";
import { z } from "zod";

export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]+$/;
const scalar = z.union([z.number().finite(), z.string().max(200), z.boolean()]);

const labVerifySchema = z.object({
  classId: z.string().min(1).max(128).regex(ID, "Invalid classId"),
  kcId: z.string().min(1).max(128).regex(ID, "Invalid kcId"),
  labType: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "Invalid labType"),
  // bounded: this object is stored with the evidence record
  parameters: z
    .record(z.string().max(64), z.union([scalar, z.array(scalar).max(32)]))
    .refine((p) => Object.keys(p).length <= 24, "Too many parameters"),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { classId, kcId, labType, parameters } = await parseJson(req, labVerifySchema);

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
    const evidenceResult = await applyEvidenceIfEnrolled({
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
        ...(evidenceResult || {}),
        credited: !!evidenceResult,
      },
    });
  } catch (error: unknown) {
    return handleAuthError(error);
  }
}
