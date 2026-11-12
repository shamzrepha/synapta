import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { searchImages, type ImageFilter } from "@/lib/images/commons";
import { findBestImages } from "@/lib/images/find";

export const runtime = "nodejs";

/** Subject-filtered educational image search combining Wikipedia, Wikimedia Commons & Openverse. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "img_search", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") || "").trim().slice(0, 120);
    const term = (sp.get("term") || "").trim().slice(0, 100);
    const topic = (sp.get("topic") || "").trim().slice(0, 120);
    const wiki = (sp.get("wiki") || "").trim().slice(0, 120);
    const rawFilter = sp.get("filter");
    const filter: ImageFilter = rawFilter === "diagram" || rawFilter === "photo" ? rawFilter : "all";

    const query = q || term;
    if (query.length < 2) return NextResponse.json({ ok: true, data: { images: [] } });

    const best = await findBestImages({
      term: term || query,
      wikipediaTitle: wiki || undefined,
      imageQuery: q || undefined,
      topic: topic || undefined,
      filter,
      limit: 8,
    });
    if (best.length > 0 || term || sp.get("strict") === "1") {
      return NextResponse.json({ ok: true, data: { images: best } });
    }
    return NextResponse.json({ ok: true, data: { images: await searchImages(query, 8, filter) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
