import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

interface Photo {
  title: string;
  thumb: string;
  page: string;
  license: string;
  credit: string;
}

const strip = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Real reference photos and diagrams for a part, fetched from Wikimedia Commons with their licence and
 * author — we show what the component really looks like instead of drawing it from imagination.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ ok: true, data: { photos: [] } });
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Cextmetadata%7Cmime&iiurlwidth=480`;
    const r = await fetch(url, { headers: { "User-Agent": "SunrootStudio/1.0 (education; parts reference)" }, next: { revalidate: 60 * 60 * 24 * 7 } });
    if (!r.ok) return NextResponse.json({ ok: true, data: { photos: [] } });
    const j = (await r.json()) as { query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: Array<{ thumburl?: string; mime?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }> }> } };
    const photos: Photo[] = Object.values(j.query?.pages || {})
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((p) => {
        const ii = p.imageinfo?.[0];
        if (!ii?.thumburl || !/^image\/(jpeg|png|webp)/.test(ii.mime || "")) return null;
        const m = ii.extmetadata || {};
        return { title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), thumb: ii.thumburl, page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`, license: strip(m.LicenseShortName?.value || "see page"), credit: strip(m.Artist?.value || "Wikimedia Commons contributor") };
      })
      .filter((x): x is Photo => !!x)
      .slice(0, 4);
    return NextResponse.json({ ok: true, data: { photos } });
  } catch (error) {
    return handleAuthError(error);
  }
}
