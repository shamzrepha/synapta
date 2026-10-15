import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb } from "@/lib/firebase/admin";
import { clampTree, rawNodeSchema } from "@/lib/mindmap/tree";

export const runtime = "nodejs";

const COLLECTION = "mindMaps";

const saveSchema = z.object({ title: z.string().trim().min(1).max(80), tree: rawNodeSchema });

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mindmap-save", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { title, tree } = await parseJson(req, saveSchema);
    const clamped = clampTree(tree);
    if (!clamped) throw new ApiError(400, "VALIDATION", "Empty mind map");
    const createdAt = new Date().toISOString();
    const ref = await adminDb().collection(COLLECTION).add({ uid: caller.uid, title, tree: clamped, createdAt });
    return NextResponse.json({ ok: true, data: { id: ref.id, title, tree: clamped, createdAt } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(200).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, title: String(x.title || "Mind map"), tree: x.tree, createdAt: String(x.createdAt || "") };
      })
      .filter((m) => m.tree && typeof m.tree === "object")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
    return NextResponse.json({ ok: true, data: items });
  } catch (error) {
    return handleAuthError(error);
  }
}
