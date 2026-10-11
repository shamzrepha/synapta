import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const updateContentSchema = z.object({
  status: z.enum(["draft", "approved", "rejected"]).optional(),
  content: z.unknown().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; hash: string }> }
) {
  try {
    const { id: classId, hash } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");

    const body = await req.json();
    const parsed = updateContentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid update" } },
        { status: 400 }
      );
    }

    const docRef = adminDb().collection("contentCache").doc(hash);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Cached content item not found" } },
        { status: 404 }
      );
    }

    const currentData = doc.data()!;
    if (currentData.classId !== classId) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Item does not belong to this class" } },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "approved") {
        updates.approvedBy = caller.uid;
      }
    }

    if (parsed.data.content !== undefined) {
      updates.content = parsed.data.content;
      updates.version = (currentData.version || 1) + 1;
    }

    await docRef.update(updates);

    return NextResponse.json({
      ok: true,
      data: {
        message: `Content updated successfully (${updates.status || "edited"}).`,
        updates,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
