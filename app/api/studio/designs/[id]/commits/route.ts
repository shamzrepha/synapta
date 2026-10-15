import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { commitDesign, loadDesign } from "@/lib/studio/store";
import { parseSpec } from "@/lib/studio/spec";
import { z } from "zod";

export const runtime = "nodejs";

/** Version history (newest first), without the full specs. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadDesign(id, caller);
    const snap = await ref.collection("commits").orderBy("createdAt", "desc").limit(100).get();
    return NextResponse.json({
      ok: true,
      data: {
        commits: snap.docs.map((d) => {
          const c = d.data();
          return { id: d.id, parentId: c.parentId, authorUid: c.authorUid, authorName: c.authorName, message: c.message, source: c.source, diff: c.diff, createdAt: c.createdAt?.toDate?.().toISOString() || null };
        }),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  spec: z.record(z.unknown()),
  parentId: z.string().min(1),
  message: z.string().max(200).default(""),
  source: z.enum(["manual", "param"]).default("manual"),
});

/** Save a new version (manual edits, wiring, code, slider changes). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_commit", limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    let spec;
    try {
      spec = parseSpec(body.spec);
    } catch (e) {
      throw new ApiError(400, "VALIDATION", e instanceof Error ? e.message : "Invalid design");
    }
    const r = await commitDesign({ id, user: caller, spec, parentId: body.parentId, message: body.message ?? "", source: body.source ?? "manual" });
    return NextResponse.json({ ok: true, data: r });
  } catch (error) {
    return handleAuthError(error);
  }
}
