import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parsePrefs } from "@/lib/settings/prefs";
import { parseAccessibility } from "@/lib/settings/accessibility";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { forgetUserLanguage } from "@/lib/i18n/server";

export const runtime = "nodejs";

const schema = z.object({
  dataSaver: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  noAutoplay: z.boolean().optional(),
  soundEffects: z.boolean().optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
  accessibility: z.unknown().optional(),
});

/** The caller's saved device & accessibility preferences (mirror of localStorage). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("users").doc(caller.uid).get();
    const d = snap.exists ? snap.data() : undefined;
    return NextResponse.json({
      ok: true,
      data: {
        prefs: d?.prefs ? parsePrefs(d.prefs) : null,
        accessibility: d?.accessibility ? parseAccessibility(d.accessibility) : null,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await parseJson(req, schema);
    const { accessibility: rawA11y, ...rawPrefs } = body;
    const hasPrefs =
      typeof rawPrefs.dataSaver === "boolean" ||
      typeof rawPrefs.reduceMotion === "boolean" ||
      typeof rawPrefs.noAutoplay === "boolean" ||
      typeof rawPrefs.soundEffects === "boolean" ||
      typeof rawPrefs.language === "string";

    const update: Record<string, unknown> = { prefsUpdatedAt: Timestamp.now() };
    const prefs = hasPrefs ? parsePrefs(rawPrefs) : undefined;
    if (prefs) {
      update.prefs = prefs;
      update.language = prefs.language;
    }
    const accessibility = rawA11y !== undefined ? parseAccessibility(rawA11y) : undefined;
    if (accessibility) update.accessibility = accessibility;

    await adminDb().collection("users").doc(caller.uid).set(update, { merge: true });
    if (prefs) forgetUserLanguage(caller.uid);
    return NextResponse.json({
      ok: true,
      data: { ...(prefs ? { prefs } : {}), ...(accessibility ? { accessibility } : {}) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
