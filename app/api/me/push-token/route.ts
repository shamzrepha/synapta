import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { createHash } from "crypto";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(20).max(4096), enabled: z.boolean() });

/** Registers or removes this browser for web push. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { token, enabled } = await parseJson(req, schema);
    const id = createHash("sha256").update(token).digest("hex").slice(0, 40);
    const ref = adminDb().collection("users").doc(caller.uid).collection("pushTokens").doc(id);
    if (enabled) await ref.set({ token, userAgent: req.headers.get("user-agent")?.slice(0, 200) || "", createdAt: Timestamp.now() });
    else await ref.delete();
    return NextResponse.json({ ok: true, data: { enabled } });
  } catch (error) {
    return handleAuthError(error);
  }
}
