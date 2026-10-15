import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminBucket } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_BYTES = 1_500_000;
const schema = z.object({
  // data:image/jpeg;base64,... (the client resizes/compresses before upload)
  dataUrl: z.string().max(2_200_000),
  scope: z.enum(["posts"]).default("posts"),
});

const MAGIC: Array<{ type: string; ext: string; test: (b: Buffer) => boolean }> = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { type: "image/png", ext: "png", test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/webp", ext: "webp", test: (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" },
  { type: "image/gif", ext: "gif", test: (b) => b.slice(0, 3).toString() === "GIF" },
];

/** Stores a user image (validated by its bytes, not its claimed type) and returns its storage path. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "upload_image", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { dataUrl, scope } = await parseJson(req, schema);
    const m = dataUrl.match(/^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new ApiError(400, "VALIDATION", "Unsupported image.");
    const bytes = Buffer.from(m[1], "base64");
    if (bytes.length > MAX_BYTES) throw new ApiError(413, "TOO_LARGE", "Image is too large (max 1.5 MB after compression).");
    const kind = MAGIC.find((k) => k.test(bytes));
    if (!kind) throw new ApiError(400, "VALIDATION", "Only JPEG, PNG, WebP or GIF images are allowed.");

    const path = `${scope ?? "posts"}/${caller.uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${kind.ext}`;
    await adminBucket().file(path).save(bytes, { contentType: kind.type, resumable: false, metadata: { cacheControl: "private, max-age=31536000" } });
    return NextResponse.json({ ok: true, data: { path, url: `/api/media/${path}` } });
  } catch (error) {
    return handleAuthError(error);
  }
}
