import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** Top hashtags by use over the last 3 days (recent days weigh more). */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const snap = await adminDb().collection("hashtagStats").orderBy("lastUsedAt", "desc").limit(80).get();
    const days = [0, 1, 2].map((n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10));
    const weights = [3, 2, 1];
    const trending = snap.docs
      .map((d) => {
        const data = d.data();
        const perDay = days.map((day) => (data.days?.[day] as number) || 0);
        return {
          tag: data.tag as string,
          recent: perDay.reduce((a, b) => a + b, 0),
          score: perDay.reduce((a, n, i) => a + n * weights[i], 0),
          total: data.total || 0,
        };
      })
      .filter((t) => t.recent > 0)
      .sort((a, b) => b.score - a.score || b.total - a.total)
      .slice(0, 10);
    return NextResponse.json({ ok: true, data: { trending } });
  } catch (error) {
    return handleAuthError(error);
  }
}
