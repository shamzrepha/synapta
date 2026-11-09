import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb } from "@/lib/firebase/admin";
import { now } from "@/lib/worlds/store";

export const runtime = "nodejs";

const schema = z.object({
  worldId: z.string().min(1).max(128),
  activityId: z.string().min(1).max(100),
  kind: z.enum(["wrong_answer", "unclear", "not_in_my_notes", "other"]),
  note: z.string().trim().max(500).optional(),
});

/** "Report a problem" on any activity (spec 8). Goes to an admin queue; the reporter does not see that item again. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: user.uid, keyPrefix: "worlds-report", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const b = await parseJson(req, schema);
    await adminDb().collection("reports").add({ ...b, reporterUid: user.uid, status: "open", createdAt: now() });
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
