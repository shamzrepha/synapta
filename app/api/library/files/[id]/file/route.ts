import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { readAcademic } from "@/lib/academic/server";
import { readRep, repCovers, studentCanSee } from "@/lib/library/access";
import { getFile } from "@/lib/library/storage";
import { FILES } from "@/lib/library/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Like = { institutionId?: string | null; institution?: string; department?: string; level?: number | null };

/** Sends the file itself to someone allowed to see it. The browser can keep a copy, so it still opens with no data. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const snap = await FILES().doc(id).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "File not found");
    const d = snap.data() as Record<string, unknown>;
    const user = (await adminDb().collection("users").doc(caller.uid).get()).data() || {};
    const allowed = caller.role === "admin" || repCovers(readRep(user), d as Like) || studentCanSee(readAcademic(user), d as Like);
    if (!allowed) throw new ApiError(403, "FORBIDDEN", "That file is not in your library.");
    const bytes = await getFile(id, d.where === "bucket" ? "bucket" : "disk");
    if (!bytes) throw new ApiError(404, "FILE_MISSING", "The file is no longer available. Tell your course rep.");
    const name = String(d.fileName || "file").replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": String(d.mime || "application/octet-stream"),
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
