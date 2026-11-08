import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { generatePieceLab, getStoredPieces, toClientPiece, MAX_PIECES } from "@/lib/sim/pieces";
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
    const stored = published ? await getStoredPieces(classId, kcId) : new Map();
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
