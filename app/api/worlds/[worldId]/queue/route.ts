import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { buildQueue, dueCount } from "@/lib/worlds/memory";
import { canPlay, loadActivities, loadCards } from "@/lib/worlds/play";
import { col, loadLibrary } from "@/lib/worlds/store";

export const runtime = "nodejs";

/** Ward Round: today's review session, built from what is due, safety-critical first, mixed and rotated (spec 16.3). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    const { ok } = await canPlay(user.uid, worldId);
    if (!ok) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
    const limit = Math.min(40, Math.max(5, Number(req.nextUrl.searchParams.get("limit")) || 20));
    const [lib, cards] = await Promise.all([loadLibrary(worldId), loadCards(user.uid, worldId)]);
    const units = Object.values(lib.units);
    const acts = await col.worlds().doc(worldId).collection("activities").get();
    const all = acts.docs.map((d) => d.data()) as Awaited<ReturnType<typeof loadActivities>>;
    const session = buildQueue(units, all, cards, { limit, newLimit: 5 });
    return NextResponse.json({ ok: true, data: { activities: session, due: dueCount(units, cards), critical: units.filter((u) => u.critical).map((u) => u.id) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
