import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import type { Activity } from "@/lib/worlds/activities";
import { canPlay, loadActivities, loadUnits } from "@/lib/worlds/play";
import { col } from "@/lib/worlds/store";

export const runtime = "nodejs";

/** One lesson: its beats and every activity it uses. Answers are included on purpose: the facts are the student's own notes and play works offline. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ worldId: string; nodeId: string }> }) {
  try {
    const { worldId, nodeId } = await params;
    const user = await requireUser(req);
    const { ok } = await canPlay(user.uid, worldId);
    if (!ok) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
    const snap = await col.worlds().doc(worldId).collection("nodes").doc(nodeId).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "That lesson was not found.");
    const node = snap.data() as { title: string; kuIds: string[]; beats: Array<{ checkActivityId?: string }>; activityIds: string[]; estMinutes: number };
    const activities = await loadActivities(worldId, node.activityIds);
    const units = await loadUnits(worldId, node.kuIds);
    const critical = new Set(units.filter((u) => u.critical).map((u) => u.id));
    // practice order: easy to hard, flip cards first, ordering and matching last
    const practice = [...activities].sort((a: Activity, b: Activity) => a.difficulty - b.difficulty).slice(0, 30);
    return NextResponse.json({ ok: true, data: { node: { id: nodeId, title: node.title, estMinutes: node.estMinutes, beats: node.beats }, activities: practice, critical: [...critical] } });
  } catch (error) {
    return handleAuthError(error);
  }
}
