import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { generateAndStoreSimulation, getStoredSimulation, toClientSimulation } from "@/lib/sim/store";
import { z } from "zod";

export const runtime = "nodejs";
// Writing a full simulation is long-form code generation; give it room.
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const sim = await getStoredSimulation(classId, kcId);
    const canManage = access.canMutate;
    return NextResponse.json({
      ok: true,
      data: {
        simulation: toClientSimulation(sim, { includeInstructions: canManage }),
        canManage,
        // Students can trigger the very first build so a topic is never left without a simulation
        canGenerate: canManage || ((access.isEnrolled || access.isOwner) && (!sim || !sim.html)),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const generateSchema = z.object({
  instructions: z.string().max(2000).optional(),
  previousError: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const body = await parseJson(req, generateSchema);

    const canManage = access.canMutate;
    if (!canManage && !access.isEnrolled) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Enroll in this class to use its simulations." } },
        { status: 403 }
      );
    }

    const sim = await generateAndStoreSimulation({
      classId,
      kcId,
      userId: caller.uid,
      // Only teachers can steer the generation; students get the default design
      instructions: canManage ? body.instructions?.trim() || undefined : undefined,
      previousError: body.previousError,
      allowReplace: canManage,
    });

    return NextResponse.json({
      ok: true,
      data: { simulation: toClientSimulation(sim, { includeInstructions: canManage }), canManage },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
