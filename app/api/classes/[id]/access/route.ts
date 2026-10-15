import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/**
 * Lightweight access check for every class page. Members get `canView: true`; everyone else gets
 * what the join screen needs (public classes also show their topic outline, locked).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const access = await getClassAccess(caller, id);
    const c = access.classData;
    if (access.canView) {
      return NextResponse.json({ ok: true, data: { canView: true, role: access.role, enrollmentStatus: access.enrollmentStatus } });
    }
    const outline = access.canPreview
      ? (await adminDb().collection("classes").doc(id).collection("kcs").orderBy("order", "asc").limit(60).get()).docs
          .filter((d) => d.data().status !== "draft" && d.data().status !== "archived")
          .map((d) => ({ id: d.id, title: String(d.data().title || "Topic") }))
      : [];
    return NextResponse.json({
      ok: true,
      data: {
        canView: false,
        role: access.role,
        enrollmentStatus: access.enrollmentStatus,
        class: {
          id,
          title: c.title || "Class",
          subject: c.subject || "",
          teacherName: c.teacherName || "",
          visibility: c.visibility === "public" ? "public" : "private",
          published: c.status === "published",
          studentCount: c.studentCount || 0,
          description: access.canPreview ? String(c.description || "") : "",
        },
        outline,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
