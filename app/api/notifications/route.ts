import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 30));
    const col = adminDb().collection("users").doc(caller.uid).collection("notifications");
    const [snap, unreadAgg] = await Promise.all([
      col.orderBy("createdAt", "desc").limit(limit).get(),
      col.where("read", "==", false).count().get(),
    ]);
    const notifications = snap.docs.map((d) => {
      const n = d.data();
      return {
        id: d.id,
        type: n.type,
        title: n.title,
        body: n.body || "",
        href: n.href || null,
        icon: n.icon || null,
        read: !!n.read,
        createdAt: n.createdAt?.toDate?.().toISOString() || null,
      };
    });
    return NextResponse.json({ ok: true, data: { notifications, unreadCount: unreadAgg.data().count } });
  } catch (error) {
    return handleAuthError(error);
  }
}
