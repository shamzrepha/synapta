import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
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
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "sim-ideas", limit: 8, windowMs: 60_000 });
    if (limited) return limited;
    await assertClassAccess(caller, classId, "mutate");
    const sim = await getStoredSimulation(classId, kcId);
    const ideas = await recommendSimulation({
      classId,
      kcId,
      userId: caller.uid,
      current: (sim?.html || sim?.studioSpec) ? { title: sim.title, goal: sim.goal, howTo: sim.howTo || [] } : null,
    });
    return NextResponse.json({ ok: true, data: ideas });
  } catch (error) {
    return handleAuthError(error);
  }
}
