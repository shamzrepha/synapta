import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { buildClassWithAi } from "@/lib/teacher/classBuilder";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const access = await assertClassAccess(caller, id, "mutate");
    const classData = access.classData;

    const body = await req.json().catch(() => ({}));

    const result = await buildClassWithAi({
      classId: id,
      title: body.title || classData.title,
      subject: body.subject || classData.subject,
      description: body.description || classData.description,
      level: body.level || classData.level || "undergrad",
      durationWeeks: body.durationWeeks || classData.durationWeeks || 4,
      audienceTags: body.audienceTags || classData.audienceTags || [],
      seedMaterialText: body.seedMaterialText,
      userId: caller.uid,
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
