import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** Recent achievements the learner hasn't posted or dismissed yet. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("users").doc(caller.uid).collection("pendingShares").orderBy("createdAt", "desc").limit(10).get();
    const cutoff = Date.now() - 14 * 86_400_000;
    return NextResponse.json({
      ok: true,
      data: {
        items: snap.docs
          .filter((d) => (d.data().createdAt?.toMillis?.() || 0) > cutoff)
          .map((d) => ({ id: d.id, text: String(d.data().text || ""), meta: d.data().meta || {}, createdAt: d.data().createdAt?.toDate?.().toISOString() || null })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
