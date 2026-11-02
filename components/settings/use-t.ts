"use client";

import { useCallback } from "react";
import { usePrefs } from "./use-prefs";
import { translate } from "@/lib/i18n/ui";

/** Translator for the app's own menu words, following the learner's language setting. */
export function useT(): (text: string) => string {
  const [prefs] = usePrefs();
  return useCallback((text: string) => translate(prefs.language, text), [prefs.language]);
}
