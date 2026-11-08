"use client";

import React, { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { LANGUAGES } from "@/lib/i18n/languages";

/**
 * Lets a teacher read a topic the way students in another language will: the published lecture note translated
 * from the teacher's original. Read-only; the teacher always edits the original, and every edit flows to every
 * language on the students' next visit.
 */
export function LanguagePreview({ classId, kcId }: { classId: string; kcId: string }) {
  const [lang, setLang] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (code: string) => {
    setLang(code);
    setText(null);
    setError(null);
    if (!code) return;
    setBusy(true);
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${kcId}?lang=${code}`).then((r) => r.json());
      if (j.ok) setText(j.data.lessonMarkdown || j.data.description || "");
      else setError(j.error?.message || "Couldn't load the preview.");
    } catch {
      setError("Couldn't load the preview.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <Languages className="h-4 w-4 text-brand-600" />
        <span className="font-semibold">Preview as students in</span>
        <select
          value={lang}
          onChange={(e) => pick(e.target.value)}
          translate="no"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Choose a language…</option>
          {LANGUAGES.filter((l) => l.code !== "en").map((l) => (
            <option key={l.code} value={l.code}>
              {l.native} ({l.name})
            </option>
          ))}
        </select>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Translating" />}
      </label>
      <p className="text-xs text-slate-500">You edit the original; students see your published version translated into their language, refreshed whenever you change it.</p>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {text !== null && (
        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <MarkdownRenderer localized content={text} />
        </div>
      )}
    </div>
  );
}
