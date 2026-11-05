import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bump(map: Record<string, number>, key: unknown) {
  const k = typeof key === "string" && key ? key : "unknown";
  map[k] = (map[k] ?? 0) + 1;
}

/** Admin only: how many people use each platform, device type, and the app vs the website. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const snap = await adminDb().collection("deviceStats").limit(5000).get();
    const platform: Record<string, number> = {};
    const formFactor: Record<string, number> = {};
    const mode: Record<string, number> = {};
    const browser: Record<string, number> = {};
    const appBuild: Record<string, number> = {};
    let active7d = 0;
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    for (const doc of snap.docs) {
      const d = doc.data();
      bump(platform, d.platform);
      bump(formFactor, d.formFactor);
      bump(mode, d.mode);
      bump(browser, d.browser);
      if (d.mode === "android-app") bump(appBuild, String(d.appBuild ?? "unknown"));
      if (typeof d.lastSeen === "string" && Date.parse(d.lastSeen) >= weekAgo) active7d++;
    }
    return NextResponse.json({ ok: true, data: { total: snap.size, active7d, platform, formFactor, mode, browser, appBuild } });
  } catch (error) {
    return handleAuthError(error);
  }
}
