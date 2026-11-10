"use client";

import React, { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, ListTree, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InteractiveNote } from "@/components/lesson/interactive-note";
import { readPrefs } from "@/components/settings/use-prefs";
import { asArray } from "@/lib/api/client";
import { rankBlocks } from "@/lib/study/locate";
import { cn } from "@/lib/utils";

interface Kc {
  id: string;
  title: string;
  order?: number;
  description?: string;
  lessonMarkdown?: string;
  parentId?: string | null;
  published?: { lesson?: boolean };
}
interface Section extends Kc {
  depth: number;
}

const THIN = 600;

function buildSections(kcs: Kc[]): Section[] {
  const byOrder = (a: Kc, b: Kc) => (a.order ?? 0) - (b.order ?? 0);
  const ids = new Set(kcs.map((k) => k.id));
  const kids = new Map<string, Kc[]>();
  const roots: Kc[] = [];
  for (const k of kcs) {
    if (k.parentId && ids.has(k.parentId) && k.parentId !== k.id) kids.set(k.parentId, [...(kids.get(k.parentId) || []), k]);
    else roots.push(k);
  }
  const out: Section[] = [];
  const seen = new Set<string>();
  const walk = (k: Kc, depth: number) => {
    if (seen.has(k.id)) return;
    seen.add(k.id);
    out.push({ ...k, depth });
    (kids.get(k.id) || []).sort(byOrder).forEach((c) => walk(c, Math.min(depth + 1, 3)));
  };
  roots.sort(byOrder).forEach((r) => walk(r, 0));
  kcs.filter((k) => !seen.has(k.id)).forEach((k) => walk(k, 0));
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Scrolls to the paragraph (inside a topic) whose text begins like the given block text, and flashes it. */
function flashBlock(kcId: string, blockText: string): boolean {
  const root = document.querySelector(`[data-kc="${kcId}"]`);
  if (!root) return false;
  const want = norm(blockText).slice(0, 50);
  const els = Array.from(root.querySelectorAll("p, li, td"));
  const el = els.find((e) => norm(e.textContent || "").includes(want)) as HTMLElement | undefined;
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("note-flash");
  window.setTimeout(() => el.classList.remove("note-flash"), 3200);
  return true;
}

export default function InteractiveReadingPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  const router = useRouter();
  const sp = useSearchParams();
  const wantKc = sp.get("kc");
  const wantFind = sp.get("find");

  const [title, setTitle] = useState("");
  const [kcs, setKcs] = useState<Kc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [q, setQ] = useState("");
  const [fromRef, setFromRef] = useState(false);
  const [progress, setProgress] = useState(0);
  const jumped = useRef(false);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const lang = readPrefs().language;
        const res = await fetch(`/api/classes/${classId}${lang !== "en" ? `?lang=${encodeURIComponent(lang)}` : ""}`);
        const j = await res.json();
        if (off) return;
        if (!j.ok || !j.data?.class) throw new Error(j.error?.message || "Couldn't open this class.");
        setTitle(String(j.data.class.title || "Class"));
        setKcs(asArray<Kc>(j.data.kcs));
      } catch (e) {
        if (!off) setError(e instanceof Error ? e.message : "Couldn't open this class.");
      }
    })();
    try {
      const v = Number(localStorage.getItem("sunroot:readScale"));
      if (v >= 0.85 && v <= 1.6) setScale(v); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      /* ignore */
    }
    return () => {
      off = true;
    };
  }, [classId]);

  const sections = useMemo(() => buildSections(kcs || []), [kcs]);

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(`kc-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
    setTocOpen(false);
  }, []);

  // where am I: the topic whose heading is highest on the screen; also the reading progress bar
  useEffect(() => {
    if (sections.length === 0) return;
    const onScroll = () => {
      const h = document.documentElement;
      setProgress(Math.min(100, Math.max(0, (window.scrollY / Math.max(1, h.scrollHeight - window.innerHeight)) * 100)));
      let cur: string | null = null;
      for (const s of sections) {
        const el = document.getElementById(`kc-${s.id}`);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.3) cur = s.id;
      }
      setActive((a) => cur ?? a ?? sections[0].id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  // arriving from a quiz/flashcard "find in notes": jump to the topic, then to the exact paragraph
  useEffect(() => {
    if (jumped.current || sections.length === 0 || (!wantKc && !wantFind)) return;
    jumped.current = true;
    const t = window.setTimeout(() => {
      if (wantKc) goTo(wantKc);
      if (wantFind) {
        const pool = wantKc ? sections.filter((s) => s.id === wantKc) : sections;
        let best: { kc: string; text: string; score: number } | null = null;
        for (const s of pool) {
          const r = rankBlocks(s.lessonMarkdown || "", wantFind, 1)[0];
          if (r && (!best || r.score > best.score)) best = { kc: s.id, text: r.text, score: r.score };
        }
        if (best) window.setTimeout(() => flashBlock(best!.kc, best!.text), 700);
        setFromRef(true);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [sections, wantKc, wantFind, goTo]);

  const results = useMemo(() => {
    const term = q.trim();
    if (term.length < 3) return [];
    const out: Array<{ kc: Section; text: string; heading: string; score: number }> = [];
    for (const s of sections) {
      const lower = (s.title || "").toLowerCase().includes(term.toLowerCase());
      if (lower) out.push({ kc: s, text: s.title, heading: "", score: 2 });
      for (const r of rankBlocks(s.lessonMarkdown || "", term, 2)) out.push({ kc: s, text: r.text, heading: r.heading, score: r.score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [q, sections]);

  const setScaleSaved = (v: number) => {
    const n = Math.min(1.6, Math.max(0.85, Math.round(v * 100) / 100));
    setScale(n);
    try {
      localStorage.setItem("sunroot:readScale", String(n));
    } catch {
      /* ignore */
    }
  };

  const toc = (
    <nav aria-label="Table of contents" className="space-y-0.5">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => goTo(s.id)}
          style={{ paddingLeft: `${0.6 + s.depth * 0.9}rem` }}
          className={cn(
            "w-full text-left rounded-lg py-2 pr-2 text-sm leading-snug transition-colors",
            active === s.id ? "bg-brand-600/10 text-brand-700 dark:text-brand-300 font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted",
            s.depth > 0 && "text-[13px]"
          )}
        >
          {s.title}
        </button>
      ))}
    </nav>
  );

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center space-y-3">
        <p className="font-semibold">{error}</p>
        <Link href={`/classes/${classId}`} className="text-brand-600 underline text-sm">Back to the class</Link>
      </div>
    );
  }
  if (!kcs) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-28" style={{ ["--note-scale" as string]: String(scale) }}>
      <div className="fixed top-0 inset-x-0 z-[45] h-0.5 bg-transparent pointer-events-none" aria-hidden>
        <div className="h-full bg-brand-600 transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex flex-wrap items-center gap-2 py-3">
        <Link href={`/classes/${classId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {title}
        </Link>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Text size">
          <button type="button" onClick={() => setScaleSaved(scale - 0.1)} aria-label="Smaller text" className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-muted"><Minus className="h-4 w-4" /></button>
          <span className="text-xs font-semibold w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScaleSaved(scale + 0.1)} aria-label="Larger text" className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-muted"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find anything in these notes"
          aria-label="Find in notes"
          className="w-full h-11 rounded-xl border border-border bg-card pl-9 pr-9 text-sm focus:outline-none focus:border-brand-500"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-full hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        )}
        {results.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-card shadow-elevated overflow-hidden">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-muted border-b border-border last:border-0"
                  onClick={() => {
                    setQ("");
                    goTo(r.kc.id);
                    if (r.heading || r.text !== r.kc.title) window.setTimeout(() => flashBlock(r.kc.id, r.text), 650);
                  }}
                >
                  <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-300 truncate">{r.kc.title}{r.heading ? ` › ${r.heading}` : ""}</p>
                  <p className="text-sm line-clamp-2">{r.text}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {fromRef && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-sm">
          <BookOpen className="h-4 w-4 text-brand-600 shrink-0" />
          <span className="flex-1">This is where it is explained.</span>
          <Button size="sm" variant="outline" onClick={() => router.back()}>Back</Button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-2">Contents</p>
            {toc}
          </div>
        </aside>

        <main className="min-w-0 note-paper">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mb-1">{title}</h1>
          <p className="text-sm text-muted-foreground mb-4">{sections.length} topics. Tap any highlighted word to learn more.</p>
          {sections.length === 0 && <p className="text-sm text-muted-foreground">There are no topics here yet.</p>}
          {sections.map((s) => {
            const text = (s.lessonMarkdown || "").trim();
            const hidden = s.published?.lesson === false;
            const thin = text.length < THIN;
            return (
              <section key={s.id} id={`kc-${s.id}`} data-kc={s.id} className="scroll-mt-20 pt-6 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 mb-3">
                  {s.depth === 0 ? (
                    <h2 className="text-2xl font-bold tracking-tight">{s.title}</h2>
                  ) : (
                    <h3 className="text-xl font-bold tracking-tight">{s.title}</h3>
                  )}
                  <Link href={`/classes/${classId}/topics/${s.id}`} className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline">
                    Practice this topic →
                  </Link>
                </div>
                {hidden ? (
                  <p className="text-sm text-muted-foreground">Your teacher hasn&apos;t published this note yet.</p>
                ) : thin ? (
                  <div className="space-y-2">
                    {s.description && <p className="note-prose">{s.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      The full note for this topic is written the first time it is opened.{" "}
                      <Link href={`/classes/${classId}/topics/${s.id}`} className="text-brand-600 underline">Open the topic</Link>
                    </p>
                  </div>
                ) : (
                  <InteractiveNote bare lazy markdown={text} topicTitle={s.title} />
                )}
              </section>
            );
          })}
        </main>
      </div>

      <button
        type="button"
        onClick={() => setTocOpen(true)}
        className="lg:hidden fixed bottom-24 right-4 z-40 h-12 px-4 rounded-full bg-brand-600 text-white shadow-elevated inline-flex items-center gap-2 text-sm font-semibold"
      >
        <ListTree className="h-4 w-4" /> Contents
      </button>
      {tocOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] flex items-end bg-black/50" onClick={() => setTocOpen(false)} role="presentation">
          <div className="note-sheet w-full max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-card p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Contents">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold">Contents</p>
              <button type="button" onClick={() => setTocOpen(false)} aria-label="Close" className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            {toc}
          </div>
        </div>
      )}
    </div>
  );
}
