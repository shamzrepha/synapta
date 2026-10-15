import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { getOrSynthesizeTurn } from "@/lib/lesson/audio";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Streams one narrated turn as MP3 (cached by the browser; same for every learner). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string; turn: string }> }) {
  try {
    const { id: classId, kcId, turn } = await params;
    const caller = await requireUser(req);
    await assertClassAccess(caller, classId, "view");
    const index = Number(turn);
    if (!Number.isInteger(index) || index < 0 || index > 50) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Bad turn" } }, { status: 400 });
    }
    const audio = await getOrSynthesizeTurn(classId, kcId, index);
    if (!audio) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "No audio" } }, { status: 404 });
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
