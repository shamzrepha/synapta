import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { buildClassWithAi, ClassBuildInput } from "@/lib/teacher/classBuilder";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id, jobId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "view");

    const jobDoc = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("buildJobs")
      .doc(jobId)
      .get();

    if (!jobDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Build job not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { id: jobDoc.id, ...jobDoc.data() },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id, jobId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const jobDoc = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("buildJobs")
      .doc(jobId)
      .get();

    if (!jobDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Build job not found" } },
        { status: 404 }
      );
    }

    const jobData = jobDoc.data()!;
    if (!jobData.input) {
      return NextResponse.json(
        { ok: false, error: { code: "CANNOT_RESUME", message: "Job has no saved input configuration to resume." } },
        { status: 400 }
      );
    }

    const result = await buildClassWithAi(jobData.input as ClassBuildInput, jobId);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
