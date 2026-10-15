import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { loadDesign } from "@/lib/studio/store";

export const runtime = "nodejs";

/** One version with its full spec (to preview or compare). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  try {
    const { id, cid } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadDesign(id, caller);
    const c = await ref.collection("commits").doc(cid).get();
    if (!c.exists) throw new ApiError(404, "NOT_FOUND", "Version not found");
    const d = c.data()!;
    return NextResponse.json({ ok: true, data: { commit: { id: c.id, message: d.message, authorName: d.authorName, source: d.source, diff: d.diff, createdAt: d.createdAt?.toDate?.().toISOString() || null }, spec: d.spec } });
  } catch (error) {
    return handleAuthError(error);
  }
}
