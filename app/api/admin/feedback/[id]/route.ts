import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";

export const runtime = "nodejs";

const body = z.object({ status: z.enum(["new", "seen", "planned", "done", "declined"]), note: z.string().trim().max(300).optional() });

const TELL: Record<string, string> = { planned: "We're planning to do this. Thank you for the idea.", done: "This is done. Thank you for helping make Sunroot better." };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const { id } = await params;
    const b = await parseJson(req, body);
    const ref = adminDb().collection("feedback").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Message not found");
    const x = snap.data()!;
    await ref.update({ status: b.status, ...(b.note !== undefined ? { note: b.note } : {}), updatedAt: Timestamp.now(), handledBy: admin.uid });
    // tell the person when their idea moves, once per change
    if (TELL[b.status] && x.status !== b.status) {
      await notify(String(x.uid), { type: "system", title: b.status === "done" ? "Your suggestion is live" : "Your suggestion is planned", body: b.note ? `${TELL[b.status]} ${b.note}` : TELL[b.status], href: "/feedback" });
    }
    return NextResponse.json({ ok: true, data: { status: b.status } });
  } catch (error) {
    return handleAuthError(error);
  }
}
