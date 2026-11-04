import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { clearSiteCache, getSiteConfig, saveSiteConfig, type SiteConfig } from "@/lib/config/site";

export const runtime = "nodejs";

/** Site-wide switches: pause AI for everyone, and the notice banner. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    clearSiteCache();
    return NextResponse.json({ ok: true, data: await getSiteConfig() });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  aiPaused: z.boolean().optional(),
  aiPausedMessage: z.string().max(240).optional(),
  noticeText: z.string().max(240).optional(),
  noticeLevel: z.enum(["info", "warning"]).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const body = await parseJson(req, schema);
    clearSiteCache();
    const cur = await getSiteConfig();
    const text = body.noticeText !== undefined ? body.noticeText.trim() : cur.notice?.text ?? "";
    const next: SiteConfig = {
      aiPaused: body.aiPaused ?? cur.aiPaused,
      aiPausedMessage: body.aiPausedMessage ?? cur.aiPausedMessage,
      notice: text ? { text, level: body.noticeLevel ?? cur.notice?.level ?? "info" } : null,
    };
    await saveSiteConfig(next, admin.uid);
    return NextResponse.json({ ok: true, data: await getSiteConfig() });
  } catch (error) {
    return handleAuthError(error);
  }
}
