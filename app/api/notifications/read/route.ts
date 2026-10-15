import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { resetUnread } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ ids: z.array(z.string()).max(100).optional() });

/** Marks the given notifications (or all unread) as read and resets the badge count. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { ids } = await parseJson(req, schema);
    const col = adminDb().collection("users").doc(caller.uid).collection("notifications");
    const docs = ids && ids.length > 0
      ? (await adminDb().getAll(...ids.map((id) => col.doc(id)))).filter((d) => d.exists)
      : (await col.where("read", "==", false).limit(500).get()).docs;
    const batch = adminDb().batch();
    for (const d of docs) batch.update(d.ref, { read: true });
    if (docs.length > 0) await batch.commit();
    const remaining = (await col.where("read", "==", false).count().get()).data().count;
    if (remaining === 0) await resetUnread(caller.uid);
    return NextResponse.json({ ok: true, data: { unreadCount: remaining } });
  } catch (error) {
    return handleAuthError(error);
  }
}
