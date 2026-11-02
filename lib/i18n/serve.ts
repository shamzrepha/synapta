import type { NextRequest } from "next/server";
import type { AuthenticatedUser } from "@/lib/auth/requireUser";
import { getUserLanguage } from "./server";
import { isLanguageCode, DEFAULT_LANGUAGE, type LanguageCode } from "./languages";
import { localizeJson } from "./translate";

/**
 * The language a class's shared content is written in. Class content is generated in English (the generators opt
 * out of the teacher's language), so every class is English unless it records otherwise; a teacher changing their
 * own language setting never changes what their class is written in.
 */
export async function classSourceLanguage(classData: { contentLanguage?: unknown } | null | undefined): Promise<LanguageCode> {
  return isLanguageCode(classData?.contentLanguage) ? classData.contentLanguage : DEFAULT_LANGUAGE;
}

/**
 * The language a class-content response should be in, or null for the original. Students get their own language.
 * Teachers get the original (what they edit and publish stays the single source of truth), unless they preview a
 * language with `?lang=yo`.
 */
export async function contentLanguage(req: NextRequest, caller: AuthenticatedUser, isTeacher: boolean): Promise<LanguageCode | null> {
  if (isTeacher) {
    const want = req.nextUrl.searchParams.get("lang");
    return isLanguageCode(want) ? want : null;
  }
  return getUserLanguage(caller.uid);
}

/** The payload in the reader's language (from the class's source language); the original if that isn't possible. */
export async function localizeFor<T>(req: NextRequest, caller: AuthenticatedUser, isTeacher: boolean, payload: T, source: LanguageCode = DEFAULT_LANGUAGE): Promise<T> {
  const lang = await contentLanguage(req, caller, isTeacher);
  if (!lang || lang === source) return payload;
  try {
    return await localizeJson(payload, lang);
  } catch (err) {
    console.warn(`[i18n] could not localize content into ${lang}:`, err instanceof Error ? err.message : err);
    return payload;
  }
}
