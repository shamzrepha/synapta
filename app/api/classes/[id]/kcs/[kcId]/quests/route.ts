import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { generateQuest, getStoredQuests, questRef, questStatus, MAX_QUEST_PIECES, type StoredQuest } from "@/lib/quest/store";
import { toClientChallenge } from "@/lib/quest/schema";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; kcId: string }> };

/** No `index`: a summary of every piece's quest. With `index`: that quest's challenges, ready to play (answers stay on the server). */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const kcData = (await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get()).data() || {};
    const published = access.canMutate || isPublished(kcData, "simulation");
    const objectives: string[] = Array.isArray(kcData.objectives) ? kcData.objectives.slice(0, MAX_QUEST_PIECES) : [];

    const indexParam = req.nextUrl.searchParams.get("index");
    if (indexParam !== null) {
      const index = Number(indexParam);
      if (!Number.isInteger(index) || index < 0 || index >= objectives.length) throw new ApiError(400, "BAD_PIECE", "That piece does not exist.");
      if (!published) throw new ApiError(403, "NOT_PUBLISHED", "These challenges aren't published yet.");
      const snap = await questRef(classId, kcId, index).get();
      const q = snap.exists ? (snap.data() as StoredQuest) : null;
      if (!q || questStatus(q) !== "ready" || !q.challenges?.length) throw new ApiError(404, "NO_QUEST", "There are no challenges for this piece yet.");
      return NextResponse.json({ ok: true, data: { index, objective: q.objective, challenges: q.challenges.map((c) => toClientChallenge(c)) } });
    }

    const stored = published ? await getStoredQuests(classId, kcId) : new Map<number, StoredQuest>();
    const quests = objectives.map((objective, index) => {
      const q = stored.get(index);
      return q ? { index, objective, status: questStatus(q), count: q.challenges?.length || 0, error: q.error || undefined } : { index, objective, status: "none" as const, count: 0 };
    });
    return NextResponse.json({ ok: true, data: { quests, canManage: access.canMutate, published } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const buildSchema = z.object({ index: z.number().int().min(0).max(MAX_QUEST_PIECES - 1) });

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const { index } = await parseJson(req, buildSchema);
    if (!access.canMutate) {
      return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Only the teacher builds the challenges. You'll see them once they're published." } }, { status: 403 });
    }
    const q = await generateQuest({ classId, kcId, index, userId: caller.uid });
    return NextResponse.json({ ok: true, data: { index, status: q.status, count: q.challenges.length } });
  } catch (error) {
    return handleAuthError(error);
  }
}
