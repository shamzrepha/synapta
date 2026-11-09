import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { resolveConflict } from "@/lib/worlds/audit";
import { rebuildWorld } from "@/lib/worlds/build";
import { col, loadLibrary, saveLibrary, now } from "@/lib/worlds/store";

export const runtime = "nodejs";

const schema = z.object({ conflictId: z.string().min(1).max(100), choice: z.enum(["a", "b", "later"]) });

/** The student settles a disagreement in her notes: "This one", "That one", or "ask my lecturer later" (spec 8). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    const snap = await col.worlds().doc(worldId).get();
    if (!snap.exists || snap.data()?.ownerUid !== user.uid) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
    const { conflictId, choice } = await parseJson(req, schema);
    let lib = await loadLibrary(worldId);
    const c = lib.conflicts[conflictId];
    if (!c) throw new ApiError(404, "NOT_FOUND", "That question was not found.");
    if (choice === "later") c.status = "later";
    else lib = resolveConflict(lib, conflictId, choice === "a" ? c.kuIdA : c.kuIdB);
    await saveLibrary(worldId, lib);
    if (choice !== "later") await rebuildWorld(worldId, lib);
    const open = Object.values(lib.conflicts).filter((x) => x.status === "open").length;
    await col.worlds().doc(worldId).set({ stats: { ...snap.data()?.stats, conflictCount: open }, updatedAt: now() }, { merge: true });
    return NextResponse.json({ ok: true, data: { open } });
  } catch (error) {
    return handleAuthError(error);
  }
}
