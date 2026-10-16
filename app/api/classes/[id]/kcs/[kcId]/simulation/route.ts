import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { simulationForStudents } from "@/lib/classes/live";
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
    const kcSnap = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
    const published = access.canMutate || isPublished(kcSnap.data(), "simulation");
    // Teachers see their working copy; students see the version that was pushed
    const sim = access.canMutate ? await getStoredSimulation(classId, kcId) : published ? await simulationForStudents(classId, kcId, kcSnap.data() || {}) : null;
    const canManage = access.canMutate;
    return NextResponse.json({
      ok: true,
      data: {
        simulation: toClientSimulation(sim, { includeInstructions: canManage }),
        canManage,
        published,
        // Only the teacher builds simulations; students see them once published
        canGenerate: canManage
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const generateSchema = z.object({
  /** "create" builds from scratch (first build or "start over"); "edit" changes the current code. */
  mode: z.enum(["create", "edit"]).optional().default("create"),
  instructions: z.string().max(2000).optional(),
  changeRequest: z.string().max(2000).optional(),
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
    if (!canManage) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Only the teacher builds the simulation. You'll see it once it's published." } },
        { status: 403 }
      );
    }

    const mode = canManage ? body.mode : "create";
    const changeRequest = body.changeRequest?.trim() || undefined;
    if (mode === "edit" && !changeRequest && !body.previousError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Describe the change you want to make." } },
        { status: 400 }
      );
    }

    const sim = await generateAndStoreSimulation({
      classId,
      kcId,
      userId: caller.uid,
      mode,
      // Only teachers can steer the generation; students get the default design
      instructions: canManage ? body.instructions?.trim() || undefined : undefined,
      changeRequest: canManage ? changeRequest : undefined,
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
