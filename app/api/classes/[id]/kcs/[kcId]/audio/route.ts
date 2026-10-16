import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { audioForStudents } from "@/lib/classes/live";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { getAudioLesson, generateAudioLesson, recordTurns } from "@/lib/lesson/audio";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const kcSnap = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
    const published = access.canMutate || isPublished(kcSnap.data(), "audio");
    // Teachers see their working copy; students see the version that was pushed
    const lesson = access.canMutate ? await getAudioLesson(classId, kcId) : published ? await audioForStudents(classId, kcId, kcSnap.data() || {}) : null;
    const enabled = access.classData.audioLessons !== false;
    return NextResponse.json({
      ok: true,
      data: {
        lesson,
        enabled,
        published,
        canManage: access.canMutate,
        canGenerate: access.canMutate,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({ regenerate: z.boolean().optional().default(false), recordMissing: z.boolean().optional().default(false) });

/** Records the topic's audio lesson. Students can trigger the first recording; teachers can re-record. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const { regenerate, recordMissing } = await parseJson(req, schema);
    const enabled = access.classData.audioLessons !== false;
    if (!access.canMutate || !enabled) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: access.canMutate ? "Audio lessons are turned off for this class." : "Only the teacher records the podcast. You'll hear it once it's published." } },
        { status: 403 }
      );
    }
    if (recordMissing) {
      // Finish recording lines that didn't make it (a slow voice, a timeout) — still only the missing ones
      const current = await getAudioLesson(classId, kcId);
      if (!current || current.status !== "ready") return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Create the podcast first." } }, { status: 404 });
      const have = await recordTurns(classId, kcId, current);
      const next = { ...current, turns: current.turns.map((t, i) => ({ ...t, hasAudio: have[i] })) };
      await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).collection("audio").doc("meta").set({ turns: next.turns }, { merge: true });
      return NextResponse.json({ ok: true, data: { lesson: next } });
    }
    const lesson = await generateAudioLesson({ classId, kcId, userId: caller.uid, force: access.canMutate && regenerate === true });
    return NextResponse.json({ ok: true, data: { lesson } });
  } catch (error) {
    return handleAuthError(error);
  }
}
