import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const patchAssignmentSchema = z.object({
  title: z.string().min(3).optional(),
  status: z.enum(["draft", "published"]).optional(),
  overview: z.string().optional(),
  teacherNotes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await req.json();
    const parsed = patchAssignmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid payload" } },
        { status: 400 }
      );
    }

    const docRef = adminDb()
      .collection("classes")
      .doc(id)
      .collection("assignments")
      .doc(assignmentId);

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Assignment not found" } },
        { status: 404 }
      );
    }

    const data = docSnap.data()!;
    if (data.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Not authorized to update this assignment" } },
        { status: 403 }
      );
    }

    const updates = {
      ...parsed.data,
      updatedAt: Timestamp.now(),
    };

    await docRef.update(updates);

    return NextResponse.json({
      ok: true,
      data: {
        assignment: { ...data, ...updates, id: assignmentId },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    const docRef = adminDb()
      .collection("classes")
      .doc(id)
      .collection("assignments")
      .doc(assignmentId);

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Assignment not found" } },
        { status: 404 }
      );
    }

    const data = docSnap.data()!;
    if (data.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Not authorized to delete this assignment" } },
        { status: 403 }
      );
    }

    await docRef.delete();

    return NextResponse.json({
      ok: true,
      data: { message: "Assignment deleted successfully" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
