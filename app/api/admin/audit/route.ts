import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);

    const snap = await adminDb()
      .collection("auditLogs")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const logs = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        actorUid: data.actorUid,
        actorName: data.actorName || null,
        action: data.action,
        targetType: data.targetType || null,
        targetId: data.targetId || null,
        details: data.details || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
      };
    });

    return NextResponse.json({
      ok: true,
      data: { logs },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
