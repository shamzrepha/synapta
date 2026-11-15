import { NextRequest, NextResponse } from "next/server";
import { handleAuthError, requireUser } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import {
  isValidCohortId,
  loadLearnerDna,
  updateLearnerModalityPreference,
} from "@/lib/adaptive/learner-dna";
import { LEARNING_COHORTS } from "@/lib/learning/telemetry";
import { z } from "zod";

export const runtime = "nodejs";

const patchDnaSchema = z.object({
  preferredCohort: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const dna = await loadLearnerDna(caller.uid);
    return NextResponse.json({
      ok: true,
      data: {
        dna,
        cohorts: Object.values(LEARNING_COHORTS).map((c) => ({
          id: c.id,
          label: c.label,
          shortLabel: c.shortLabel,
        })),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await parseJson(req, patchDnaSchema);
    const nextPref = body.preferredCohort ?? null;
    if (nextPref !== null && !isValidCohortId(nextPref)) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_COHORT", message: "Unsupported learning style preference." } },
        { status: 400 }
      );
    }
    const dna = await updateLearnerModalityPreference(caller.uid, nextPref);
    return NextResponse.json({ ok: true, data: { dna } });
  } catch (err) {
    return handleAuthError(err);
  }
}
