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
    const lesson = await getAudioLesson(classId, kcId);
    const enabled = access.classData.audioLessons !== false;
    return NextResponse.json({
      ok: true,
      data: {
        lesson,
        enabled,
        canManage: access.canMutate,
        canGenerate: access.canMutate || (enabled && access.isEnrolled && (!lesson || lesson.status === "failed")),
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
    if (!access.canMutate && !(enabled && access.isEnrolled)) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Audio lessons aren't enabled for this class." } },
        { status: 403 }
      );
    }
    const lesson = await generateAudioLesson({ classId, kcId, userId: caller.uid, force: access.canMutate && regenerate === true });
    return NextResponse.json({ ok: true, data: { lesson } });
  } catch (error) {
    return handleAuthError(error);
  }
}
