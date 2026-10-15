import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  showOnLeaderboard: z.boolean().optional(),
  autoShareAchievements: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await parseJson(req, schema);
    const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (body.showOnLeaderboard !== undefined) update["settings.showOnLeaderboard"] = body.showOnLeaderboard;
    if (body.autoShareAchievements !== undefined) update["settings.autoShareAchievements"] = body.autoShareAchievements;
    await adminDb().collection("users").doc(caller.uid).update(update);
    return NextResponse.json({ ok: true, data: body });
  } catch (error) {
    return handleAuthError(error);
  }
}
