import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { TEMPLATES } from "@/lib/studio/templates";

export const runtime = "nodejs";

/** Pre-saved projects (no AI needed). */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    return NextResponse.json({
      ok: true,
      data: { templates: TEMPLATES.map((t) => ({ id: t.id, title: t.title, kind: t.kind, level: t.level, tags: t.tags, blurb: t.blurb, guided: !!t.starter })) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
