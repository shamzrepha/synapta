import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parsePrefs } from "@/lib/settings/prefs";

export const runtime = "nodejs";

const schema = z.object({ dataSaver: z.boolean(), reduceMotion: z.boolean(), noAutoplay: z.boolean() });

/** The caller's saved device preferences (mirror of what the browser keeps in localStorage). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("users").doc(caller.uid).get();
    return NextResponse.json({ ok: true, data: { prefs: snap.exists && snap.data()?.prefs ? parsePrefs(snap.data()!.prefs) : null } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const prefs = await parseJson(req, schema);
    await adminDb().collection("users").doc(caller.uid).set({ prefs, prefsUpdatedAt: Timestamp.now() }, { merge: true });
    return NextResponse.json({ ok: true, data: { prefs } });
  } catch (error) {
    return handleAuthError(error);
  }
}
