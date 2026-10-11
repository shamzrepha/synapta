import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, id, "view");
    const isOwnerOrAdmin = access.isOwner || access.isAdmin;

    const snap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("assignments")
      .get();

    const assignments = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          ...data,
          status: (data.status as string) || "draft",
          createdAt: (data.createdAt as { toDate?: () => Date })?.toDate ? (data.createdAt as { toDate: () => Date }).toDate().toISOString() : null,
          updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate ? (data.updatedAt as { toDate: () => Date }).toDate().toISOString() : null,
        };
      })
      .filter((a) => {
        // Students can only see published assignments
        if (isOwnerOrAdmin) return true;
        return a.status === "published";
      })
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const tA = typeof a.createdAt === "string" ? new Date(a.createdAt).getTime() : 0;
        const tB = typeof b.createdAt === "string" ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });

    return NextResponse.json({
      ok: true,
      data: {
        assignments,
        isTeacher: isOwnerOrAdmin,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
