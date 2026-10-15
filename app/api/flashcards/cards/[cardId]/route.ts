import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { cardsRef } from "@/lib/flashcards/generate";
import { z } from "zod";

export const runtime = "nodejs";

async function loadOwnCard(cardId: string, uid: string) {
  const snap = await cardsRef().doc(cardId).get();
  if (!snap.exists || snap.data()?.uid !== uid) throw new ApiError(404, "NOT_FOUND", "Card not found");
  return snap.ref;
}

const editSchema = z.object({ front: z.string().trim().min(1).max(300), back: z.string().trim().min(1).max(600) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  try {
    const caller = await requireUser(req);
    const { cardId } = await params;
    const ref = await loadOwnCard(cardId, caller.uid);
    const { front, back } = await parseJson(req, editSchema);
    await ref.update({ front, back, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, data: { id: cardId, front, back } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  try {
    const caller = await requireUser(req);
    const { cardId } = await params;
    const ref = await loadOwnCard(cardId, caller.uid);
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id: cardId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
