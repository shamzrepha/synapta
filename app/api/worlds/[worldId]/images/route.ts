import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { pickBest, pictureTerm, searchCommons } from "@/lib/worlds/images";
import { rebuildWorld } from "@/lib/worlds/build";
import { col, loadLibrary, now } from "@/lib/worlds/store";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ worldId: string }> };

async function ownWorld(worldId: string, uid: string) {
  const snap = await col.worlds().doc(worldId).get();
  if (!snap.exists || snap.data()?.ownerUid !== uid) throw new ApiError(404, "NOT_FOUND", "That world was not found.");
}
const imagesCol = (worldId: string) => col.knowledge(worldId).collection("images");

/** Suggested and approved pictures for a world. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    await ownWorld(worldId, user.uid);
    const [snap, lib] = await Promise.all([imagesCol(worldId).get(), loadLibrary(worldId)]);
    const images = snap.docs.map((d) => d.data() as { kuId: string; status: string; term: string; candidate: unknown }).map((x) => ({ ...x, statement: lib.units[x.kuId]?.statement }));
    return NextResponse.json({ ok: true, data: { images } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Looks for a picture for facts that name something visible (a sign, a structure). Suggestions only: she approves each one. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    await ownWorld(worldId, user.uid);
    const limited = await checkRateLimit(req, { uid: user.uid, keyPrefix: "worlds-images", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const lib = await loadLibrary(worldId);
    const have = new Set((await imagesCol(worldId).get()).docs.map((d) => d.id));
    const targets = Object.values(lib.units)
      .filter((u) => u.status === "active" && !have.has(u.id))
      .map((u) => ({ u, term: pictureTerm(u) }))
      .filter((x): x is { u: (typeof x)["u"]; term: string } => !!x.term)
      .slice(0, 10);
    let found = 0;
    await Promise.all(
      targets.map(async ({ u, term }) => {
        const best = pickBest(await searchCommons(term));
        if (!best) return;
        found++;
        await imagesCol(worldId).doc(u.id).set({ kuId: u.id, term, status: "suggested", candidate: best, createdAt: now() });
      })
    );
    return NextResponse.json({ ok: true, data: { searched: targets.length, found } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Use or skip a suggested picture. Using one adds a "what is shown here?" question to the world. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { worldId } = await params;
    const user = await requireUser(req);
    await ownWorld(worldId, user.uid);
    const { kuId, decision } = await parseJson(req, z.object({ kuId: z.string().min(1).max(100), decision: z.enum(["approve", "skip"]) }));
    const ref = imagesCol(worldId).doc(kuId);
    if (!(await ref.get()).exists) throw new ApiError(404, "NOT_FOUND", "That picture was not found.");
    await ref.update({ status: decision === "approve" ? "approved" : "skipped" });
    if (decision === "approve") await rebuildWorld(worldId);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
