import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { readRep, repCovers } from "@/lib/library/access";
import { deleteFile } from "@/lib/library/storage";
import { FILES, publicFile } from "@/lib/library/server";

export const runtime = "nodejs";

async function load(id: string, uid: string, role: string) {
  const snap = await FILES().doc(id).get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "File not found");
  const d = snap.data() as Record<string, unknown>;
  const rep = readRep((await adminDb().collection("users").doc(uid).get()).data());
  if (role !== "admin" && !repCovers(rep, d as { institutionId?: string | null; institution?: string; department?: string })) throw new ApiError(403, "FORBIDDEN", "That file isn't in your department.");
  return { ref: snap.ref, d };
}

const patch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(["textbook", "lecture_note", "slides", "past_question", "other"]).optional(),
  level: z.number().int().min(100).max(600).nullable().optional(),
});

/** A rep (or admin) corrects what the library thinks a file is. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const b = await parseJson(req, patch);
    const { ref, d } = await load(id, caller.uid, caller.role);
    await ref.update({ ...b, ...(b.kind ? { readPolicy: b.kind === "textbook" ? "index_only" : d.readPolicy } : {}) });
    return NextResponse.json({ ok: true, data: { file: publicFile({ ...d, ...b }) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const { ref, d } = await load(id, caller.uid, caller.role);
    await deleteFile(id, d.where === "bucket" ? "bucket" : "disk");
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
