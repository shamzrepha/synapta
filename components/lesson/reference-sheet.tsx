"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2, X } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { readPrefs } from "@/components/settings/use-prefs";
import { rankBlocks, toBlocks } from "@/lib/study/locate";

const cache = new Map<string, { title: string; markdown: string }>();

/** "Where is this in the notes?": shows the passage that explains an answer, without leaving the quiz or the cards. */
export function ReferenceSheet({ classId, kcId, query, onClose }: { classId: string; kcId: string; query: string; onClose: () => void }) {
  const [kc, setKc] = useState<{ title: string; markdown: string } | null>(cache.get(`${classId}:${kcId}`) || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kc) return;
    let off = false;
    (async () => {
      try {
        const lang = readPrefs().language;
        const res = await fetch(`/api/classes/${classId}?kc=${encodeURIComponent(kcId)}${lang !== "en" ? `&lang=${encodeURIComponent(lang)}` : ""}`);
        const j = await res.json();
        const found = (Array.isArray(j?.data?.kcs) ? j.data.kcs : []).find((k: { id: string }) => k.id === kcId) as { title?: string; lessonMarkdown?: string } | undefined;
        if (!found) throw new Error("Couldn't find this topic's notes.");
        const v = { title: String(found.title || "Topic"), markdown: String(found.lessonMarkdown || "") };
        cache.set(`${classId}:${kcId}`, v);
        if (!off) setKc(v);
      } catch (e) {
        if (!off) setError(e instanceof Error ? e.message : "Couldn't open the notes.");
      }
    })();
    return () => {
      off = true;
    };
  }, [classId, kcId, kc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const found = useMemo(() => {
    if (!kc) return null;
    const best = rankBlocks(kc.markdown, query, 1)[0];
    if (!best) return { best: null as null, context: [] as string[], heading: "" };
    const all = toBlocks(kc.markdown);
    const around = all.filter((b) => b.heading === best.heading && Math.abs(b.index - best.index) <= 1);
    return { best, context: around.map((b) => b.text), heading: best.heading };
  }, [kc, query]);

  const link = `/classes/${classId}/read?kc=${encodeURIComponent(kcId)}&find=${encodeURIComponent(query.slice(0, 400))}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center bg-black/50 sm:p-4" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Where this is in the notes" onClick={(e) => e.stopPropagation()} className="note-sheet w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-elevated">
        <div className="sticky top-0 bg-card/95 backdrop-blur flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <h3 className="font-bold flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 text-brand-600 shrink-0" />
            <span className="truncate">In your notes{kc ? `: ${kc.title}` : ""}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {!kc && !error && (
            <p className="text-sm text-muted-foreground flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Finding it…</p>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {kc && found?.best && (
            <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4">
              {found.heading && <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300 mb-1">{found.heading}</p>}
              {found.context.map((t, i) => (
                <p key={i} className={t === found.best!.text ? "text-[15px] leading-relaxed font-medium" : "text-sm leading-relaxed text-muted-foreground mt-1"}>
                  {t === found.best!.text ? <mark className="rounded bg-brand-500/20 px-0.5">{t}</mark> : t}
                </p>
              ))}
            </div>
          )}
          {kc && found && !found.best && (
            <div className="space-y-2">
              <p className="text-sm">I couldn&apos;t find one exact passage for this. Here is the start of the topic&apos;s note:</p>
              <div className="rounded-2xl border border-border p-4 max-h-56 overflow-y-auto">
                <MarkdownRenderer localized content={kc.markdown.slice(0, 1200) || "This topic has no written note yet."} />
              </div>
            </div>
          )}
          <Link href={link} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 w-full" onClick={onClose}>
            <BookOpen className="h-4 w-4" /> Open in interactive reading
          </Link>
        </div>
      </div>
    </div>
  );
}
