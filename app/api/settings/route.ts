import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parsePrefs } from "@/lib/settings/prefs";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { forgetUserLanguage } from "@/lib/i18n/server";

export const runtime = "nodejs";

const schema = z.object({ dataSaver: z.boolean(), reduceMotion: z.boolean(), noAutoplay: z.boolean(), language: z.enum(LANGUAGE_CODES).optional() });

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
    // the language also sits on the user record, where the AI looks it up for every request
    const language = prefs.language ?? "en";
    await adminDb().collection("users").doc(caller.uid).set({ prefs, language, prefsUpdatedAt: Timestamp.now() }, { merge: true });
    forgetUserLanguage(caller.uid);
    return NextResponse.json({ ok: true, data: { prefs } });
  } catch (error) {
    return handleAuthError(error);
  }
}
