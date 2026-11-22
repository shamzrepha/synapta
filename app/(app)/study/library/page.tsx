"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, BookOpen, FileText, Layers, Map as MapIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";

interface Row { id: string; title: string; detail?: string; href: string }
interface Section { key: string; title: string; hint: string; icon: React.ComponentType<{ className?: string }>; all: string; rows: Row[] | null; failed: boolean }

const get = (u: string) => fetch(u).then((r) => r.json()).catch(() => null);

/**
 * The student's material in one place, read from where it already lives (notes, notebooks, decks, worlds, saved).
 * Nothing is copied or moved, so each tool keeps working exactly as before. A section that fails to load says so and the rest still show.
 */
export default function LibraryPage() {
  const [sections, setSections] = useState<Section[]>([
    { key: "notes", title: "Study notes", hint: "Notes made from your PDFs, scans and photos", icon: FileText, all: "/study/notes", rows: null, failed: false },
    { key: "notebooks", title: "Notebooks", hint: "Your documents, with chat and sources", icon: BookOpen, all: "/notebook", rows: null, failed: false },
    { key: "decks", title: "Flashcard decks", hint: "Spaced review cards", icon: Layers, all: "/study/flashcards", rows: null, failed: false },
    { key: "worlds", title: "Worlds", hint: "Your notes merged into one library and map", icon: MapIcon, all: "/worlds", rows: null, failed: false },
    { key: "saved", title: "Saved", hint: "Things you bookmarked", icon: Bookmark, all: "/saved", rows: null, failed: false },
  ]);

  useEffect(() => {
    let alive = true;
    const set = (key: string, rows: Row[] | null) => alive && setSections((s) => s.map((x) => (x.key === key ? { ...x, rows: rows ?? [], failed: rows === null } : x)));
    void get("/api/study/notes").then((j) => set("notes", j?.ok ? asArray<{ id: string; title: string; sourceTitle?: string }>(j.data?.notes).map((n) => ({ id: n.id, title: n.title, detail: n.sourceTitle ? `From ${n.sourceTitle}` : undefined, href: "/study/notes" })) : null));
    void get("/api/notebooks").then((j) => set("notebooks", j?.ok ? asArray<{ id: string; title: string }>(j.data?.notebooks).map((n) => ({ id: n.id, title: n.title, href: "/notebook" })) : null));
    void get("/api/flashcards").then((j) => set("decks", j?.ok ? asArray<{ id: string; title: string; cardCount?: number; dueCount?: number; sourceLabel?: string }>(j.data?.decks).map((d) => ({ id: d.id, title: d.title, detail: `${d.cardCount ?? 0} cards${d.dueCount ? ` · ${d.dueCount} due` : ""}${d.sourceLabel ? ` · from ${d.sourceLabel}` : ""}`, href: "/study/flashcards" })) : null));
    void get("/api/worlds").then((j) => set("worlds", j?.ok ? asArray<{ id: string; title: string }>(j.data?.worlds).map((w) => ({ id: w.id, title: w.title, href: `/worlds/${w.id}` })) : null));
    void get("/api/bookmarks").then((j) => set("saved", j?.ok ? asArray<{ id?: string; key?: string; title: string; subtitle?: string; href?: string }>(j.data?.items).map((b, i) => ({ id: String(b.id ?? b.key ?? i), title: b.title, detail: b.subtitle || undefined, href: b.href || "/saved" })) : null));
    return () => {
      alive = false;
    };
  }, []);

  const empty = sections.every((s) => s.rows !== null && s.rows.length === 0 && !s.failed);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">Library</p>
          <h1 className="text-2xl font-semibold tracking-tight">Your material</h1>
          <p className="text-sm text-muted-foreground">Everything you have added or made, in one place. Open any item in the tool that made it.</p>
        </div>
        <Link href="/study/notes"><Button><Plus className="mr-1.5 h-4 w-4" /> Add material</Button></Link>
      </div>

      {empty && (
        <Card className="space-y-2 p-6 text-center">
          <p className="text-lg font-semibold">Nothing here yet</p>
          <p className="text-sm text-muted-foreground">Add a PDF, a scan or a photo of your notes and Sunroot will make a lesson and practice from it.</p>
          <Link href="/study/notes"><Button>Add your first material</Button></Link>
        </Card>
      )}

      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <section key={s.key} aria-label={s.title} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-brand-600 dark:text-brand-300" /> {s.title}{s.rows ? <span className="font-mono text-xs text-muted-foreground">· {s.rows.length}</span> : null}</h2>
              <Link href={s.all} className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {s.rows === null && <Skeleton className="h-14 w-full" />}
            {s.failed && <p className="text-sm text-muted-foreground">Couldn&apos;t load this just now. Your items are safe.</p>}
            {s.rows && s.rows.length === 0 && !s.failed && <p className="text-sm text-muted-foreground">{s.hint}. None yet.</p>}
            {s.rows && s.rows.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {s.rows.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link href={r.href} className="flex min-h-[48px] items-center gap-3 px-3 py-2 hover:bg-muted/60">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.title}</span>{r.detail && <span className="block truncate text-xs text-muted-foreground">{r.detail}</span>}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {s.rows && s.rows.length > 5 && <p className="text-xs text-muted-foreground">Showing 5 of {s.rows.length}. <Link href={s.all} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">See all</Link></p>}
          </section>
        );
      })}
    </div>
  );
}
