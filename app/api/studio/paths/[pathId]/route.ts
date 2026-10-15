import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

function pathRef(uid: string, id: string) {
  return adminDb().collection("users").doc(uid).collection("paths").doc(id);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ pathId: string }> }) {
  try {
    const { pathId } = await params;
    const caller = await requireUser(req);
    const snap = await pathRef(caller.uid, pathId).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Path not found");
    const p = snap.data()!;
    return NextResponse.json({ ok: true, data: { path: { id: pathId, ...p, createdAt: p.createdAt?.toDate?.().toISOString() || null } } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Tick a checklist item: key = "stageId:index". */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ pathId: string }> }) {
  try {
    const { pathId } = await params;
    const caller = await requireUser(req);
    const { key, done } = await parseJson(req, z.object({ key: z.string().regex(/^st\d{1,2}:\d{1,2}$/), done: z.boolean() }));
    const ref = pathRef(caller.uid, pathId);
    if (!(await ref.get()).exists) throw new ApiError(404, "NOT_FOUND", "Path not found");
    await ref.update({ [`done.${key.replace(":", "_")}`]: done });
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ pathId: string }> }) {
  try {
    const { pathId } = await params;
    const caller = await requireUser(req);
    await pathRef(caller.uid, pathId).delete();
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
