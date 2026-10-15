import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { loadMedia } from "@/lib/media/store";

export const runtime = "nodejs";

/** Serves stored user images to signed-in users (paths are unguessable and scoped by uploader). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    await requireUser(req);
    const { path } = await params;
    const key = path.join("/");
    if (!/^posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(key)) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    }
    const media = await loadMedia(key);
    if (!media) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    return new NextResponse(new Uint8Array(media.bytes), {
      headers: {
        "Content-Type": media.contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
