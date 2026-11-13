import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { touchUserStreak } from "@/lib/streak/server";

export const runtime = "nodejs";

const schema = z.object({
  platform: z.enum(["android", "ios", "windows", "mac", "linux", "chromeos", "other"]),
  formFactor: z.enum(["phone", "tablet", "desktop"]),
  mode: z.enum(["android-app", "installed-web-app", "browser"]),
  browser: z.string().max(40),
  appBuild: z.number().int().min(0).max(1_000_000).optional(),
});

/** The signed-in person's device, reported once a day by the app shell. One small record per person; admin sees totals. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await parseJson(req, schema);
    await adminDb()
      .collection("deviceStats")
      .doc(user.uid)
      .set({ ...body, appBuild: body.appBuild ?? null, role: user.role, lastSeen: new Date().toISOString() }, { merge: true });
    const streakInfo = await touchUserStreak(user.uid);
    return NextResponse.json({ ok: true, data: { saved: true, streakDays: streakInfo.streakDays } });
  } catch (error) {
    return handleAuthError(error);
  }
}
