import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { clampConfig } from "@/lib/focus/timer";
import { roomRef, uniqueCode, nowTs } from "@/lib/focus/server";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().max(60).optional().default(""),
  focusMin: z.number().int().optional(),
  breakMin: z.number().int().optional(),
});

/** Rooms I created (most recent first), for the /focus landing page. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("focusRooms").where("ownerUid", "==", caller.uid).limit(30).get();
    const rooms = snap.docs
      .map((d) => {
        const r = d.data();
        return { code: d.id, title: r.title || "Focus room", focusMin: r.focusMin, breakMin: r.breakMin, createdAtMs: r.createdAtMs || 0 };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 5);
    return NextResponse.json({ ok: true, data: { rooms } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "focus_create", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const cfg = clampConfig(body);
    const user = await adminDb().collection("users").doc(caller.uid).get();
    const ownerName = user.data()?.displayName || user.data()?.username || "Someone";
    const code = await uniqueCode();
    await roomRef(code).set({
      code,
      title: body.title || `${ownerName}'s focus room`,
      ownerUid: caller.uid,
      ownerName,
      ...cfg,
      anchorMs: null,
      createdAt: nowTs(),
      createdAtMs: Date.now(),
    });
    return NextResponse.json({ ok: true, data: { code } });
  } catch (error) {
    return handleAuthError(error);
  }
}
