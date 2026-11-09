import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { getPack } from "@/lib/worlds/packs";
import { col, deleteWorldData, loadLibrary } from "@/lib/worlds/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ worldId: string }> };

async function ownWorld(worldId: string, uid: string) {
  const snap = await col.worlds().doc(worldId).get();
  if (!snap.exists || snap.data()?.ownerUid !== uid) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
  return snap;
}

/** The library behind a world: notes, concepts, facts, and anything the student still needs to confirm. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    const snap = await ownWorld(worldId, user.uid);
    const w = snap.data()!;
    const [lib, docs] = await Promise.all([loadLibrary(worldId), Promise.all(((w.docIds as string[]) ?? []).map((id) => col.sourceDocs().doc(id).get()))]);
    const units = Object.values(lib.units);
    const concepts = Object.values(lib.concepts).map((c) => ({ id: c.id, name: c.name, kind: c.kind, topic: c.topic ?? null, count: c.kuIds.filter((id) => lib.units[id]?.status === "active").length, docIds: c.docIds }));
    const conflicts = Object.values(lib.conflicts).map((c) => ({ ...c, a: lib.units[c.kuIdA]?.statement, b: lib.units[c.kuIdB]?.statement, aSource: lib.units[c.kuIdA]?.source, bSource: lib.units[c.kuIdB]?.source }));
    const pack = getPack(w.subjectPackId);
    return NextResponse.json({
      ok: true,
      data: {
        world: { id: worldId, activeJobId: w.activeJobId ?? null, title: w.title, status: w.status, subjectPackId: w.subjectPackId, themeId: w.themeId, stats: w.stats, classId: w.classId ?? null, disclaimer: pack.disclaimer ?? null },
        docs: docs.filter((d) => d.exists).map((d) => ({ id: d.id, title: d.data()?.title, pageCount: d.data()?.pageCount, flaggedCount: d.data()?.flaggedCount ?? 0 })),
        concepts,
        conflicts,
        agreed: units.filter((u) => u.alsoIn.length > 0).length,
        lowConfidence: units.filter((u) => u.status === "active" && u.confidence < 0.7).length,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    await ownWorld(worldId, user.uid);
    await deleteWorldData(worldId);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
