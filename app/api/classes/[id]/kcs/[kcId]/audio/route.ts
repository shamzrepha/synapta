import { adminDb } from "@/lib/firebase/admin";
import { isPublished } from "@/lib/classes/published";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { getAudioLesson, generateAudioLesson } from "@/lib/lesson/audio";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const kcSnap = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
    const published = access.canMutate || isPublished(kcSnap.data(), "audio");
    const lesson = published ? await getAudioLesson(classId, kcId) : null;
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

const schema = z.object({ regenerate: z.boolean().optional().default(false) });

/** Records the topic's audio lesson. Students can trigger the first recording; teachers can re-record. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const { regenerate } = await parseJson(req, schema);
    const enabled = access.classData.audioLessons !== false;
    if (!access.canMutate || !enabled) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: access.canMutate ? "Audio lessons are turned off for this class." : "Only the teacher records the podcast. You'll hear it once it's published." } },
        { status: 403 }
      );
    }
    const lesson = await generateAudioLesson({ classId, kcId, userId: caller.uid, force: access.canMutate && regenerate === true });
    return NextResponse.json({ ok: true, data: { lesson } });
  } catch (error) {
    return handleAuthError(error);
  }
}
