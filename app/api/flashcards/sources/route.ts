import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { getMyClassIds } from "@/lib/classes/members";

export const runtime = "nodejs";

/** What the student can make cards from: topics of their classes and their notebooks. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const classIds = (await getMyClassIds(caller.uid)).slice(0, 12);
    const [classes, notebooks] = await Promise.all([
      Promise.all(
        classIds.map(async (id) => {
          const [c, kcs] = await Promise.all([
            adminDb().collection("classes").doc(id).get(),
            adminDb().collection("classes").doc(id).collection("kcs").limit(60).get(),
          ]);
          if (!c.exists) return null;
          return {
            id,
            title: String(c.data()!.title || "Class"),
            topics: kcs.docs
              .map((k) => ({ id: k.id, title: String(k.data().title || ""), order: Number(k.data().order ?? 0) }))
              .filter((k) => k.title)
              .sort((a, b) => a.order - b.order)
              .map(({ id: kid, title }) => ({ id: kid, title })),
          };
        })
      ),
      adminDb().collection("notebooks").where("memberIds", "array-contains", caller.uid).limit(50).get(),
    ]);
    return NextResponse.json({
      ok: true,
      data: {
        classes: classes.filter(Boolean),
        notebooks: notebooks.docs.map((n) => ({ id: n.id, title: String(n.data().title || "Notebook"), course: String(n.data().course || "") })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
