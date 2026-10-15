import { NextRequest, NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Hashtags to suggest while typing "#ph…": prefix match on tags people already use (most used first). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "tag_suggest", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "").slice(0, 40);
    const col = adminDb().collection("hashtagStats");
    const snap = q
      ? await col.orderBy(FieldPath.documentId()).startAt(q).endAt(q + "").limit(20).get()
      : await col.orderBy("total", "desc").limit(8).get();
    const tags = snap.docs
      .map((d) => ({ tag: String(d.data().tag || d.id), total: Number(d.data().total) || 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    // a brand-new tag is always allowed: offer exactly what was typed first
    if (q.length >= 2 && !tags.some((t) => t.tag === q)) tags.unshift({ tag: q, total: 0 });
    return NextResponse.json({ ok: true, data: { tags: tags.slice(0, 8) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
