import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { undoSimulation, toClientSimulation } from "@/lib/sim/store";

export const runtime = "nodejs";

/** Teachers: restore the previous version of the topic's simulation (no AI call). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");
    const sim = await undoSimulation({ classId, kcId, userId: caller.uid });
    return NextResponse.json({
      ok: true,
      data: { simulation: toClientSimulation(sim, { includeInstructions: true }), canManage: true },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
