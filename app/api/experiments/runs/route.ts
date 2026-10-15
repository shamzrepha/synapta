import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { MAX_RUNS_PER_USER, cleanRun, runSchema } from "@/lib/experiments/runs";

export const runtime = "nodejs";

const COLLECTION = "experimentRuns";

/** The signed-in student's saved runs, newest first (optionally for one experiment). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const only = req.nextUrl.searchParams.get("experiment");
    const snap = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(200).get();
    const runs = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, experiment: x.experiment, title: x.title, note: x.note || "", params: x.params || {}, rows: x.rows || [], solved: x.solved || [], createdAt: x.createdAt?.toDate?.().toISOString() || null };
      })
      .filter((r) => !only || r.experiment === only)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return NextResponse.json({ ok: true, data: { runs } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "experiment_run", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, runSchema);
    const run = cleanRun(body);
    if (!run) throw new ApiError(400, "VALIDATION", "There is nothing to save: record at least one row first.");
    const col = adminDb().collection(COLLECTION);
    const mine = await col.where("uid", "==", caller.uid).count().get().catch(() => null);
    if (mine && mine.data().count >= MAX_RUNS_PER_USER) throw new ApiError(409, "LIMIT", `You can keep up to ${MAX_RUNS_PER_USER} saved runs. Delete one to make room.`);
    const ref = col.doc();
    const now = Timestamp.now();
    await ref.set({ ...run, uid: caller.uid, createdAt: now });
    return NextResponse.json({ ok: true, data: { id: ref.id, createdAt: now.toDate().toISOString() } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Delete one of your own runs: DELETE /api/experiments/runs?id=… */
export async function DELETE(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) throw new ApiError(400, "VALIDATION", "Missing run id");
    const ref = adminDb().collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()!.uid !== caller.uid) throw new ApiError(404, "NOT_FOUND", "Run not found");
    await ref.delete();
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
