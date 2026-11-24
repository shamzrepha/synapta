import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** Admin: pending requests to change a locked school, department or level. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const snap = await adminDb().collection("academicChangeRequests").where("status", "==", "pending").limit(100).get();
    const items = snap.docs.map((d) => {
      const x = d.data();
      return { uid: d.id, email: x.email || "", from: x.from, to: x.to, reason: x.reason || "", createdAt: x.createdAt?.toDate?.().toISOString?.() || "" };
    });
    return NextResponse.json({ ok: true, data: { items } });
  } catch (error) {
    return handleAuthError(error);
  }
}
