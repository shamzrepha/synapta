import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { piecesForStudents } from "@/lib/classes/live";
import { deletePieceLab, generatePieceLab, getStoredPieces, toClientPiece, MAX_PIECES } from "@/lib/sim/pieces";
import { bumpChannel } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; kcId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const kcData = (await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get()).data() || {};
    const published = access.canMutate || isPublished(kcData, "simulation");
    const objectives: string[] = Array.isArray(kcData.objectives) ? kcData.objectives.slice(0, MAX_PIECES) : [];
    const stored = !published ? new Map() : access.canMutate ? await getStoredPieces(classId, kcId) : await piecesForStudents(classId, kcId, kcData);
    const pieces = objectives.map((objective, index) => {
      const p = stored.get(index);
      return p ? toClientPiece(p) : { index, objective, status: "none" as const };
    });
    return NextResponse.json({ ok: true, data: { pieces, canManage: access.canMutate, published } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const buildSchema = z.object({ index: z.number().int().min(0).max(MAX_PIECES - 1) });

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "piece-build", limit: 20, windowMs: 60 * 60_000, shared: true });
    if (limited) return limited;
    const { index } = await parseJson(req, buildSchema);
    if (!access.canMutate) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Only the teacher builds the labs. You'll see them once they're published." } },
        { status: 403 }
      );
    }
    const piece = await generatePieceLab({ classId, kcId, index, userId: caller.uid });
    return NextResponse.json({ ok: true, data: { piece: toClientPiece(piece) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    if (!access.canMutate) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Only teachers can delete piece labs." } },
        { status: 403 }
      );
    }
    const raw = req.nextUrl.searchParams.get("index");
    let index: number;
    if (raw !== null) {
      const trimmed = raw.trim();
      const parsed = /^\d+$/.test(trimmed) ? buildSchema.safeParse({ index: Number(trimmed) }) : { success: false as const };
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: { code: "VALIDATION", message: "Invalid piece index." } },
          { status: 400 }
        );
      }
      index = parsed.data.index;
    } else {
      ({ index } = await parseJson(req, buildSchema));
    }
    await deletePieceLab({ classId, kcId, index });
    await bumpChannel(`kc:${classId}:${kcId}`).catch(() => null);
    return NextResponse.json({ ok: true, data: { deleted: index } });
  } catch (error) {
    return handleAuthError(error);
  }
}
