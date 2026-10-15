import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadDesign } from "@/lib/studio/store";

export const runtime = "nodejs";

/** Toggle a star. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadDesign(id, caller);
    const starRef = ref.collection("stars").doc(caller.uid);
    const starred = await adminDb().runTransaction(async (t) => {
      const s = await t.get(starRef);
      if (s.exists) {
        t.delete(starRef);
        t.update(ref, { starCount: FieldValue.increment(-1) });
        return false;
      }
      t.set(starRef, { uid: caller.uid, createdAt: Timestamp.now() });
      t.update(ref, { starCount: FieldValue.increment(1) });
      return true;
    });
    return NextResponse.json({ ok: true, data: { starred } });
  } catch (error) {
    return handleAuthError(error);
  }
}
