import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { recommendSimulation } from "@/lib/teacher/recommend";
import { getStoredSimulation } from "@/lib/sim/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Teachers: AI-suggested simulation concepts for this topic, plus improvements to the current one. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");
    const sim = await getStoredSimulation(classId, kcId);
    const ideas = await recommendSimulation({
      classId,
      kcId,
      userId: caller.uid,
      current: sim?.html ? { title: sim.title, goal: sim.goal, howTo: sim.howTo || [] } : null,
    });
    return NextResponse.json({ ok: true, data: ideas });
  } catch (error) {
    return handleAuthError(error);
  }
}
