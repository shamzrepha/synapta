import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { wallItemFrom } from "@/lib/studio/wall-server";
import { featured, filterWall, sortWall, type WallItem } from "@/lib/studio/wall";

export const runtime = "nodejs";

/** The Maker Wall: published public designs, a "featured this week" row, and filters (kind, part used, text). */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const sp = req.nextUrl.searchParams;
    // same query as the public gallery (existing index); the wall flag is filtered in memory
    const snap = await adminDb().collection("designs").where("visibility", "==", "public").orderBy("updatedAt", "desc").limit(200).get();
    const all = snap.docs.map((d) => wallItemFrom(d.id, d.data())).filter((x): x is WallItem => !!x);
    const filtered = filterWall(all, { kind: sp.get("kind") || undefined, part: sp.get("part") || undefined, q: sp.get("q") || undefined });
    const items = sortWall(filtered, sp.get("sort") === "top" ? "top" : "new").slice(0, 60);
    const parts = Array.from(new Set(all.flatMap((i) => i.partTypes))).sort();
    return NextResponse.json({ ok: true, data: { items, featured: featured(all, Date.now(), 4), parts } });
  } catch (error) {
    return handleAuthError(error);
  }
}
