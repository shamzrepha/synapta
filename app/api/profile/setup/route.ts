import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkUsername, looksLikeJpeg, presetAvatarUrl } from "@/lib/profile/avatars";

export const runtime = "nodejs";

const MAX_JPEG_BYTES = 90_000;

const body = z.object({
  username: z.string().trim().min(1).max(40),
  avatar: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("keep") }),
    z.object({ kind: z.literal("preset"), index: z.number().int().min(0).max(50) }),
    z.object({ kind: z.literal("upload"), dataUrl: z.string().max(140_000) }),
  ]),
});

/** The first-time profile step: a handle and a picture (keep the Google one, pick a starter, or upload one). Marks the profile as set up. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "profile_setup", limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    const b = await parseJson(req, body);

    const name = checkUsername(b.username);
    if (!name.ok) throw new ApiError(400, "BAD_USERNAME", name.message);
    const clash = await adminDb().collection("users").where("username", "==", name.username).limit(2).get();
    if (clash.docs.some((d) => d.id !== caller.uid)) throw new ApiError(409, "USERNAME_TAKEN", "Someone already uses that name. Try another.");

    const updates: Record<string, unknown> = { username: name.username, profileSetup: true, updatedAt: Timestamp.now() };
    if (b.avatar.kind === "preset") {
      const url = presetAvatarUrl(b.avatar.index);
      if (!url) throw new ApiError(400, "BAD_AVATAR", "Pick one of the starter pictures.");
      updates.photoURL = url;
    } else if (b.avatar.kind === "upload") {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(b.avatar.dataUrl);
      if (!m) throw new ApiError(400, "BAD_AVATAR", "Upload a JPEG or PNG picture.");
      const bytes = Buffer.from(m[1], "base64");
      if (bytes.length > MAX_JPEG_BYTES || !looksLikeJpeg(bytes)) throw new ApiError(400, "BAD_AVATAR", "That picture is too large or not a picture. Try a smaller one.");
      await adminDb().collection("avatars").doc(caller.uid).set({ data: m[1], updatedAt: Timestamp.now() });
      updates.photoURL = `/api/avatar/${caller.uid}?v=${Date.now()}`;
    }
    await adminDb().collection("users").doc(caller.uid).set(updates, { merge: true });
    return NextResponse.json({ ok: true, data: { username: name.username, photoURL: (updates.photoURL as string | undefined) ?? null } });
  } catch (error) {
    return handleAuthError(error);
  }
}
