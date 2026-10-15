import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadDesign } from "@/lib/studio/store";
import { parseVideoUrl, publishSchema } from "@/lib/studio/wall";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Owner publishes (or updates) the design on the Maker Wall; this also makes it public. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_wall", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, publishSchema);
    const { ref, data } = await loadDesign(id, caller, "owner");
    if (body.videoUrl && !parseVideoUrl(body.videoUrl)) throw new ApiError(400, "VALIDATION", "Use a YouTube or Vimeo link.");
    if (body.coverPath && !body.coverPath.startsWith(`posts/${caller.uid}/`)) throw new ApiError(400, "VALIDATION", "That photo is not yours.");
    const now = Timestamp.now();
    await ref.update({
      visibility: "public",
      wall: { description: body.description, videoUrl: body.videoUrl || "", coverPath: body.coverPath || null, publishedAt: data.wall?.publishedAt || now },
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, data: { published: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Take the project off the wall (visibility is left as it is). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadDesign(id, caller, "owner");
    await ref.update({ wall: FieldValue.delete() });
    return NextResponse.json({ ok: true, data: { published: false } });
  } catch (error) {
    return handleAuthError(error);
  }
}
