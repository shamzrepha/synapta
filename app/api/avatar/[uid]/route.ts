import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** A person's uploaded profile picture. The address carries a version (?v=), so browsers may keep it for a long time. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await requireUser(req);
    const { uid } = await params;
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return new NextResponse(null, { status: 404 });
    const doc = await adminDb().collection("avatars").doc(uid).get();
    const data = doc.exists ? (doc.data()?.data as string | undefined) : undefined;
    if (!data) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(data, "base64")), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (error) {
    return handleAuthError(error);
  }
}
