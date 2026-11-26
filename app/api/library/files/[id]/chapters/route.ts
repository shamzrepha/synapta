import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { FILES } from "@/lib/library/server";

export const runtime = "nodejs";

/**
 * Returns the chapter index for a textbook or long document.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(req);
    const { id } = await params;

    const snap = await FILES().doc(id).get();
    if (!snap.exists) {
      throw new ApiError(404, "NOT_FOUND", "File not found.");
    }

    const data = snap.data() || {};
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];

    return NextResponse.json({
      ok: true,
      data: {
        fileId: id,
        title: data.title,
        readPolicy: data.readPolicy,
        chapters,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
