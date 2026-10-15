import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { attachmentSchema } from "@/lib/chat/store";
import { z } from "zod";

export const runtime = "nodejs";

/** The caller's saved library (posts, topics, notebooks, challenges…), newest first. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("users").doc(caller.uid).collection("bookmarks").orderBy("createdAt", "desc").limit(200).get();
    return NextResponse.json({
      ok: true,
      data: {
        items: snap.docs.map((d) => ({
          key: d.id,
          kind: d.data().kind,
          title: d.data().title,
          subtitle: d.data().subtitle || "",
          href: d.data().href,
          createdAt: d.data().createdAt?.toDate?.().toISOString() || null,
        })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({ item: attachmentSchema, saved: z.boolean() });

/** Save or unsave anything shareable (topics, notebooks, challenges, rooms…). Posts use /api/feed/[id]/bookmark. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { item, saved } = await parseJson(req, schema);
    const ref = adminDb().collection("users").doc(caller.uid).collection("bookmarks").doc(`${item.type}_${item.id}`.replace(/\//g, "_"));
    if (saved) await ref.set({ kind: item.type, refId: item.id, title: item.title, subtitle: item.subtitle || "", href: item.href, createdAt: Timestamp.now() });
    else await ref.delete();
    return NextResponse.json({ ok: true, data: { saved } });
  } catch (error) {
    return handleAuthError(error);
  }
}
