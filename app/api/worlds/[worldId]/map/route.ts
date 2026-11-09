import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { dueCount, masteryOf } from "@/lib/worlds/memory";
import { getPack } from "@/lib/worlds/packs";
import { canPlay, loadCards, loadProgress, loadUnits } from "@/lib/worlds/play";

export const runtime = "nodejs";

/** The map: zones and nodes with this student's progress and mastery (read from Firestore every time, R18). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    const { ok, world } = await canPlay(user.uid, worldId);
    if (!ok || !world) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
    const nodes = (world.nodes as Array<{ id: string; title: string; zoneId: string; kuIds: string[]; estMinutes: number; activityCount: number }>) ?? [];
    const [cards, progress] = await Promise.all([loadCards(user.uid, worldId), loadProgress(user.uid, worldId)]);
    const units = await loadUnits(worldId, nodes.flatMap((n) => n.kuIds));
    const byId = new Map(units.map((u) => [u.id, u]));
    const withMastery = nodes.map((n) => {
      const kus = n.kuIds.map((id) => byId.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
      return { id: n.id, title: n.title, zoneId: n.zoneId, factCount: n.kuIds.length, estMinutes: n.estMinutes, done: !!progress.nodes[n.id]?.done, mastery: Math.round(masteryOf(kus, cards) * 100) / 100, started: kus.some((u) => cards.has(u.id)) };
    });
    return NextResponse.json({
      ok: true,
      data: {
        world: { id: worldId, title: world.title, status: world.status, themeId: world.themeId, disclaimer: getPack(world.subjectPackId).disclaimer ?? null, conflictCount: world.stats?.conflictCount ?? 0 },
        zones: ((world.zones as Array<{ id: string; title: string; nodeIds: string[]; unlock: { requiresZoneId?: string; minMastery: number } }>) ?? []).map((z) => ({ id: z.id, title: z.title, nodeIds: z.nodeIds })),
        nodes: withMastery,
        due: dueCount(units, cards),
        xp: progress.xp,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
