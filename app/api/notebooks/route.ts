import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { createNotebook, LIMITS } from "@/lib/notebooks/store";
import { getPublicProfiles } from "@/lib/social/profile";
import { z } from "zod";

export const runtime = "nodejs";

/** The caller's notebooks (own + shared with them), newest activity first. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("notebooks").where("memberIds", "array-contains", caller.uid).orderBy("updatedAt", "desc").limit(100).get();
    const owners = await getPublicProfiles(Array.from(new Set(snap.docs.map((d) => d.data().ownerUid))));
    return NextResponse.json({
      ok: true,
      data: {
        notebooks: snap.docs.map((d) => {
          const n = d.data();
          return {
            id: d.id,
            title: n.title,
            course: n.course || "General",
            role: n.roles?.[caller.uid] || "viewer",
            ownerName: owners.get(n.ownerUid)?.displayName || "",
            memberCount: (n.memberIds || []).length,
            sourceCount: n.sourceCount || 0,
            shared: (n.memberIds || []).length > 1,
            updatedAt: n.updatedAt?.toDate?.().toISOString() || null,
          };
        }),
        limits: LIMITS,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({ title: z.string().trim().min(1).max(80), course: z.string().trim().max(60).default("General") });

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { title, course } = await parseJson(req, schema);
    const id = await createNotebook(caller.uid, title, course || "General");
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
