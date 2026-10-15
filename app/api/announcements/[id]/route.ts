import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { cleanText } from "@/lib/announcements/logic";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Only the author (or an admin) may edit or delete, and they must still teach the class. */
async function loadOwned(id: string, caller: Awaited<ReturnType<typeof requireUser>>) {
  const ref = adminDb().collection("classAnnouncements").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Announcement not found");
  const a = snap.data()!;
  if (a.authorId !== caller.uid && caller.role !== "admin") throw new ApiError(403, "FORBIDDEN", "Only the author can change this announcement.");
  await assertClassAccess(caller, a.classId, "mutate");
  return { ref, a };
}

const Patch = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await parseJson(req, Patch);
    const { ref, a } = await loadOwned(id, caller);
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.title) update.title = cleanText(body.title, 140);
    if (body.body) update.body = cleanText(body.body, 5000);
    if (typeof body.pinned === "boolean") update.pinned = body.pinned;
    await ref.update(update);
    return NextResponse.json({ ok: true, data: { ...a, ...update } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const { ref } = await loadOwned(id, caller);
    const reads = await adminDb().collection("announcementReads").where("announcementId", "==", id).limit(500).get();
    const batch = adminDb().batch();
    reads.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
