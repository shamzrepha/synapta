import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { loadDesign } from "@/lib/studio/store";
import { parseSpec } from "@/lib/studio/spec";
import { validateEntry, isClosed } from "@/lib/studio/contest";
import { closeIfDue, contestsCol } from "@/lib/studio/contest-server";

export const runtime = "nodejs";

const schema = z.object({ designId: z.string().min(1).max(80) });

/**
 * Enter one of your own designs. The server re-prices the design from the shop catalog and checks
 * the allowed parts and the design's own step checks; nothing the client says about cost is trusted.
 * Entering makes the design public so voters can open it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_contest_enter", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const { designId } = await parseJson(req, schema);
    const ref = contestsCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Contest not found");
    const c = (await closeIfDue(id)) || snap.data()!;
    if (isClosed({ status: c.status, deadline: c.deadline }, Date.now())) throw new ApiError(409, "CLOSED", "This contest has closed.");

    const { data, ref: designRef } = await loadDesign(designId, caller, "owner");
    if (data.ownerUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "You can only enter a design you own.");
    const spec = parseSpec(data.spec);
    const check = validateEntry(spec, { budget: c.budget, allowedParts: c.allowedParts || [] });
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: { code: "ENTRY_INVALID", message: check.problems[0], details: { problems: check.problems, cost: check.cost } } }, { status: 422 });
    }

    const entryRef = ref.collection("entries").doc(caller.uid);
    await adminDb().runTransaction(async (t) => {
      const [cs, es] = await Promise.all([t.get(ref), t.get(entryRef)]);
      if (cs.data()?.status !== "open") throw new ApiError(409, "CLOSED", "This contest has closed.");
      if (es.exists) throw new ApiError(409, "ALREADY", "You already have an entry in this contest.");
      t.set(entryRef, { uid: caller.uid, designId, title: data.title, ownerName: data.ownerName, cost: check.cost, votes: 0, createdAt: new Date().toISOString() });
      t.update(ref, { entryCount: FieldValue.increment(1) });
    });
    if (data.visibility !== "public") await designRef.update({ visibility: "public" });
    return NextResponse.json({ ok: true, data: { cost: check.cost } });
  } catch (error) {
    return handleAuthError(error);
  }
}
