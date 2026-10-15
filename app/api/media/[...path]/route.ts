import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminBucket } from "@/lib/firebase/admin";

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
    const file = adminBucket().file(key);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": String(meta.contentType || "application/octet-stream"),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
