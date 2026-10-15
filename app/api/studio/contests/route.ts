import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { CATALOG_BY_TYPE } from "@/lib/studio/circuit/catalog";
import { contestSchema } from "@/lib/studio/contest";
import { closeIfDue, contestsCol, toContestView } from "@/lib/studio/contest-server";

export const runtime = "nodejs";

/** Lists contests (newest first). Overdue ones are closed lazily here. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const snap = await contestsCol().orderBy("createdAt", "desc").limit(60).get();
    const now = Date.now();
    const contests = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const fresh = data.status === "open" && Date.parse(data.deadline) <= now ? await closeIfDue(d.id, now) : data;
        return toContestView(d.id, fresh || data);
      }),
    );
    return NextResponse.json({ ok: true, data: { contests } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Teachers and admins create a contest. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (caller.role !== "teacher" && caller.role !== "admin") throw new ApiError(403, "FORBIDDEN", "Only teachers can create contests.");
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_contest", limit: 10, windowMs: 60 * 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, contestSchema);
    if (Date.parse(body.deadline) <= Date.now()) throw new ApiError(400, "VALIDATION", "The deadline must be in the future.");
    const allowedParts = Array.from(new Set((body.allowedParts || []).filter((t) => CATALOG_BY_TYPE[t])));
    const u = await adminDb().collection("users").doc(caller.uid).get();
    const ref = contestsCol().doc();
    await ref.set({
      id: ref.id,
      title: body.title,
      brief: body.brief,
      deadline: new Date(body.deadline).toISOString(),
      budget: body.budget,
      allowedParts,
      status: "open",
      createdBy: caller.uid,
      createdByName: String(u.data()?.displayName || u.data()?.username || "Teacher"),
      entryCount: 0,
      createdAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
