import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** Admin inbox: every message, newest first (`?status=new` for just the unread). */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const status = new URL(req.url).searchParams.get("status");
    let q: FirebaseFirestore.Query = adminDb().collection("feedback");
    if (status && status !== "all") q = q.where("status", "==", status);
    const snap = await q.limit(200).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, uid: x.uid, name: x.name, email: x.email, institution: x.institution || "", department: x.department || "", kind: x.kind, message: x.message, page: x.page || "", status: x.status, note: x.note || "", reward: x.reward || null, createdAt: x.createdAt?.toDate?.().toISOString?.() || "" };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ ok: true, data: { items } });
  } catch (error) {
    return handleAuthError(error);
  }
}
