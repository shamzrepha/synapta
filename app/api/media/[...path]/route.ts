import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseRange } from "@/lib/explainers/rules";
import { loadMedia } from "@/lib/media/store";

export const runtime = "nodejs";

/** Serves stored user images to signed-in users (paths are unguessable and scoped by uploader). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    await requireUser(req);
    const { path } = await params;
    const key = path.join("/");
    if (!/^(posts|explainers)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(key)) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    }
    const media = await loadMedia(key);
    if (!media) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    // Video needs byte ranges (Safari/iOS refuses to play without them)
    const range = parseRange(req.headers.get("range"), media.bytes.length);
    if (range) {
      return new NextResponse(new Uint8Array(media.bytes.subarray(range.start, range.end + 1)), {
        status: 206,
        headers: {
          "Content-Type": media.contentType,
          "Content-Range": `bytes ${range.start}-${range.end}/${media.bytes.length}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return new NextResponse(new Uint8Array(media.bytes), {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Type": media.contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
