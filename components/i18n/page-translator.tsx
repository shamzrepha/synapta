"use client";

import { useEffect } from "react";
import { usePrefs } from "@/components/settings/use-prefs";
import { DomTranslator } from "@/lib/i18n/dom";
import { languageInfo } from "@/lib/i18n/languages";

async function fetchTranslations(lang: string, texts: string[]): Promise<Record<string, string>> {
  const res = await fetch("/api/i18n/ui", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang, texts }) });
  const j = await res.json().catch(() => null);
  return j?.ok ? (j.data.translations as Record<string, string>) : {};
}

/** Shows the whole interface in the learner's language (see lib/i18n/dom.ts). Renders nothing itself. */
export function PageTranslator() {
  const [prefs] = usePrefs();
  const lang = prefs.language;
  useEffect(() => {
    document.documentElement.lang = lang === "pcm" ? "en-NG" : lang;
    if (lang === "en") return;
    const translator = new DomTranslator(lang, fetchTranslations);
    // after hydration has settled, so React never sees text it didn't render
    const start = setTimeout(() => translator.start(document.body), 300);
    return () => {
      clearTimeout(start);
      translator.stop();
    };
  }, [lang]);
  useEffect(() => {
    // right-to-left reading only inside generated content and translated text blocks; the layout itself stays put
    document.documentElement.dataset.langDir = languageInfo(lang).rtl ? "rtl" : "ltr";
  }, [lang]);
  return null;
}
