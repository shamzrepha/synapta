"use client";

import React, { memo, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Bookmark, ChevronLeft, ChevronRight, ListTree, Minus, Plus, Rows3, Search, Trash2, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { InteractiveNote } from "@/components/lesson/interactive-note";
import { readMinutes, splitNote } from "@/lib/study/note-sections";
import { readPrefs } from "@/components/settings/use-prefs";
import { asArray } from "@/lib/api/client";
import { rankBlocks } from "@/lib/study/locate";
import { ReadPlayer, useReadThrough } from "@/components/lesson/read-through";
import { peekClass, rememberClass } from "@/lib/client/class-cache";
import { prefetchGlossaries } from "@/lib/study/glossary-client";
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

/** The paragraph element inside a topic that begins like the given block text. */
function findBlockEl(kcId: string, blockText: string): HTMLElement | null {
  const root = document.querySelector(`[data-kc="${kcId}"]`);
  if (!root) return null;
  const want = norm(blockText).slice(0, 50);
  const els = Array.from(root.querySelectorAll("p, li, td"));
  return (els.find((e) => norm(e.textContent || "").includes(want)) as HTMLElement | undefined) ?? null;
}

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

interface Mark {
  id: string;
  kc: string;
  title: string;
  snippet: string;
  at: number;
}

/** The first paragraph near the top of the screen inside a topic: where the learner is reading. */
function firstVisibleBlock(kcId: string): string {
  const root = document.querySelector(`[data-kc="${kcId}"]`);
  if (!root) return "";
  for (const e of Array.from(root.querySelectorAll("p, li"))) {
    if (e.getBoundingClientRect().top >= 56) return (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90);
  }
  return "";
}

/** Jumps to a saved spot without animation (used to continue where the learner left off). */
function jumpToBlock(kcId: string, snippet: string): boolean {
  const heading = document.getElementById(`kc-${kcId}`);
  if (!heading) return false;
  const el = snippet ? findBlockEl(kcId, snippet) : null;
  (el || heading).scrollIntoView({ block: el ? "start" : "start", behavior: "auto" });
  if (el) window.scrollBy(0, -80);
  return true;
}

const SectionView = memo(function SectionView({ s, classId, onListen }: { s: Section; classId: string; onListen: (id: string) => void }) {
  const text = (s.lessonMarkdown || "").trim();
  const hidden = s.published?.lesson === false;
  const thin = text.length < THIN;
  return (
    <section id={`kc-${s.id}`} data-kc={s.id} className="reader-section scroll-mt-20 pt-6 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 mb-3">
        {s.depth === 0 ? <h2 className="text-2xl font-bold tracking-tight">{s.title}</h2> : <h3 className="text-xl font-bold tracking-tight">{s.title}</h3>}
        <span className="flex items-center gap-3">
          {!hidden && !thin && (
            <button type="button" onClick={() => onListen(s.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline" aria-label={`Listen from ${s.title}`}>
              <Volume2 className="h-3.5 w-3.5" /> Listen
            </button>
          )}
          <Link href={`/classes/${classId}/topics/${s.id}`} className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline">
            Practice this topic →
          </Link>
        </span>
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
        <InteractiveNote bare lazy markdown={text} topicTitle={s.title} classId={classId} kcId={s.id} />
      )}
    </section>
  );
});

export default function InteractiveReadingPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
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
  const [viewMode, setViewMode] = useState<"flip" | "scroll">("flip");
  const [flipIdx, setFlipIdx] = useState(0);
  const [flipDir, setFlipDir] = useState<"next" | "prev">("next");
  const mainRef = useRef<HTMLElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const progressBar = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [resumed, setResumed] = useState(false);
  const posKey = `sunroot:readpos:${classId}`;
  const markKey = `sunroot:marks:${classId}`;

  useEffect(() => {
    let off = false;
    const lang = readPrefs().language;
    // the last copy shows at once (going back is instant); a fresh one replaces it quietly
    const saved = peekClass<{ class: { title?: string }; kcs: unknown }>(classId, lang);
    if (saved?.class) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(String(saved.class.title || "Class"));
      setKcs(asArray<Kc>(saved.kcs));
    }
    (async () => {
      try {
        const res = await fetch(`/api/classes/${classId}${lang !== "en" ? `?lang=${encodeURIComponent(lang)}` : ""}`);
        const j = await res.json();
        if (off) return;
        if (!j.ok || !j.data?.class) throw new Error(j.error?.message || "Couldn't open this class.");
        rememberClass(classId, lang, j.data);
        setTitle(String(j.data.class.title || "Class"));
        setKcs(asArray<Kc>(j.data.kcs));
      } catch (e) {
        if (!off && !saved) setError(e instanceof Error ? e.message : "Couldn't open this class.");
      }
    })();
    try {
      const v = Number(localStorage.getItem("sunroot:readScale"));
      if (v >= 0.85 && v <= 1.6) setScale(v); // eslint-disable-line react-hooks/set-state-in-effect
      const m = JSON.parse(localStorage.getItem(`sunroot:marks:${classId}`) || "[]");
      if (Array.isArray(m)) setMarks(m as Mark[]);
    } catch {
      /* ignore */
    }
    return () => {
      off = true;
    };
  }, [classId]);

  const sections = useMemo(() => buildSections(kcs || []), [kcs]);

  const flipPages = useMemo(() => {
    const out: Array<{
      key: string;
      section: Section;
      sectionIdx: number;
      pageIdxInSection: number;
      pageTotalInSection: number;
      pageTitle: string;
      pageBody: string;
      readMins: number;
    }> = [];
    sections.forEach((s, sectionIdx) => {
      const text = (s.lessonMarkdown || "").trim();
      const hidden = s.published?.lesson === false;
      const thin = text.length < THIN;
      if (hidden || thin) {
        out.push({
          key: `${s.id}:0`,
          section: s,
          sectionIdx,
          pageIdxInSection: 0,
          pageTotalInSection: 1,
          pageTitle: s.title,
          pageBody: s.description || "",
          readMins: 1,
        });
        return;
      }
      const split = splitNote(text);
      const total = split.pages.length;
      split.pages.forEach((pg, idxInSec) => {
        out.push({
          key: `${s.id}:${idxInSec}`,
          section: s,
          sectionIdx,
          pageIdxInSection: idxInSec,
          pageTotalInSection: total,
          pageTitle: pg.title || s.title,
          pageBody: pg.body,
          readMins: readMinutes(pg.body),
        });
      });
    });
    return out;
  }, [sections]);

  const safeFlipIdx = Math.min(flipIdx, Math.max(0, flipPages.length - 1));
  const currentFlip = flipPages[safeFlipIdx] ?? null;

  const goToPage = useCallback(
    (nextIdx: number) => {
      if (flipPages.length === 0) return;
      const clamped = Math.max(0, Math.min(flipPages.length - 1, nextIdx));
      setFlipDir(clamped >= safeFlipIdx ? "next" : "prev");
      setFlipIdx(clamped);
      const target = flipPages[clamped];
      if (target) setActive(target.section.id);
      mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [flipPages, safeFlipIdx]
  );

  const findFlipIndex = useCallback(
    (id: string, snippet?: string, pageHint?: number) => {
      const matches = flipPages
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => p.section.id === id);
      if (matches.length === 0) return -1;
      if (snippet) {
        const needle = snippet.trim().toLowerCase().slice(0, 40);
        if (needle.length >= 6) {
          const hit = matches.find(({ p }) =>
            (p.pageTitle + "\n" + p.pageBody).toLowerCase().includes(needle)
          );
          if (hit) return hit.idx;
        }
      }
      if (typeof pageHint === "number" && pageHint >= 0 && pageHint < matches.length) {
        return matches[pageHint].idx;
      }
      return matches[0].idx;
    },
    [flipPages]
  );

  const goTo = useCallback(
    (id: string, snippet?: string, pageHint?: number) => {
      if (viewMode === "flip") {
        const idx = findFlipIndex(id, snippet, pageHint);
        if (idx >= 0) goToPage(idx);
        setTocOpen(false);
        return;
      }
      const el = document.getElementById(`kc-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
      setTocOpen(false);
    },
    [viewMode, findFlipIndex, goToPage]
  );

  const switchMode = useCallback(
    (nextMode: "flip" | "scroll") => {
      if (nextMode === viewMode) return;
      if (nextMode === "flip") {
        const targetKc = active || sections[0]?.id;
        setViewMode("flip");
        if (targetKc) {
          const idx = findFlipIndex(targetKc);
          if (idx >= 0) setFlipIdx(idx);
        }
      } else {
        const targetKc = currentFlip?.section.id || active;
        setViewMode("scroll");
        if (targetKc) {
          window.setTimeout(() => {
            document.getElementById(`kc-${targetKc}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
        }
      }
    },
    [viewMode, active, sections, currentFlip, findFlipIndex]
  );

  const readable = useMemo(
    () => sections.filter((s) => s.published?.lesson !== false && (s.lessonMarkdown || "").trim().length >= THIN).map((s) => ({ id: s.id, title: s.title, markdown: s.lessonMarkdown || "" })),
    [sections]
  );
  const voice = useReadThrough({ sections: readable, onSection: (id) => goTo(id), findEl: findBlockEl });
  const listeningTitle = sections.find((s) => s.id === voice.currentId)?.title || "";

  // where am I: progress bar + saving reading position (works in both flipbook and scroll modes)
  useEffect(() => {
    if (sections.length === 0) return;
    if (viewMode === "flip") {
      if (progressBar.current) {
        const pct = flipPages.length > 0 ? ((safeFlipIdx + 1) / flipPages.length) * 100 : 0;
        progressBar.current.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      }
      if (!currentFlip || safeFlipIdx === 0) return;
      const t = window.setTimeout(() => {
        try {
          const snip = firstVisibleBlock(currentFlip.section.id) || currentFlip.pageBody.slice(0, 80).trim();
          localStorage.setItem(
            posKey,
            JSON.stringify({
              kc: currentFlip.section.id,
              page: currentFlip.pageIdxInSection,
              snippet: snip,
              at: Date.now(),
            })
          );
        } catch {
          /* ignore */
        }
      }, 350);
      return () => window.clearTimeout(t);
    }
    let saveTimer: number | undefined;
    const onScroll = () => {
      const h = document.documentElement;
      if (progressBar.current) progressBar.current.style.width = `${Math.min(100, Math.max(0, (window.scrollY / Math.max(1, h.scrollHeight - window.innerHeight)) * 100))}%`;
      let cur: string | null = null;
      for (const s of sections) {
        const el = document.getElementById(`kc-${s.id}`);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.3) cur = s.id;
      }
      setActive((a) => cur ?? a ?? sections[0].id);
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        if (!cur || window.scrollY < 40) return;
        try {
          localStorage.setItem(posKey, JSON.stringify({ kc: cur, snippet: firstVisibleBlock(cur), at: Date.now() }));
        } catch {
          /* ignore */
        }
      }, 500);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(saveTimer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [sections, posKey, viewMode, flipPages.length, safeFlipIdx, currentFlip]);

  // keyboard Left/Right arrows turn pages in flipbook mode
  useEffect(() => {
    if (viewMode !== "flip" || tocOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" && safeFlipIdx < flipPages.length - 1) {
        e.preventDefault();
        goToPage(safeFlipIdx + 1);
      } else if (e.key === "ArrowLeft" && safeFlipIdx > 0) {
        e.preventDefault();
        goToPage(safeFlipIdx - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMode, tocOpen, safeFlipIdx, flipPages.length, goToPage]);

  // opening the reader again: continue where the learner left off (a quiz link or search takes priority)
  useEffect(() => {
    if (jumped.current || sections.length === 0 || wantKc || wantFind) return;
    try {
      const pos = JSON.parse(localStorage.getItem(posKey) || "null") as { kc?: string; page?: number; snippet?: string } | null;
      if (!pos?.kc || !sections.some((x) => x.id === pos.kc)) return;
      const t = window.setTimeout(() => {
        jumped.current = true;
        if (viewMode === "flip") {
          const targetIdx = findFlipIndex(pos.kc!, pos.snippet, typeof pos.page === "number" ? pos.page : undefined);
          if (targetIdx > 0) {
            setFlipIdx(targetIdx);
            setActive(pos.kc!);
            setResumed(true);
          }
          return;
        }
        if (jumpToBlock(pos.kc!, pos.snippet || "")) setResumed(true);
      }, 250);
      return () => window.clearTimeout(t);
    } catch {
      /* nothing saved */
    }
  }, [sections, wantKc, wantFind, posKey, viewMode, findFlipIndex]);

  // prepare every topic's key-word cards and pictures in the background, so no tap ever waits
  useEffect(() => {
    if (readable.length === 0) return;
    const first = wantKc ? [wantKc] : [];
    const ids = [...new Set([...first, ...readable.map((r) => r.id)])];
    let stop: (() => void) | undefined;
    const t = window.setTimeout(() => {
      stop = prefetchGlossaries(classId, ids, 2);
    }, 1200);
    return () => {
      window.clearTimeout(t);
      stop?.();
    };
  }, [classId, readable, wantKc]);

  const saveMarks = (next: Mark[]) => {
    setMarks(next);
    try {
      localStorage.setItem(markKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const addBookmark = () => {
    const kc = active || sections[0]?.id;
    if (!kc) return;
    const sec = sections.find((x) => x.id === kc);
    const snippet = firstVisibleBlock(kc);
    saveMarks([{ id: `${Date.now()}`, kc, title: sec?.title || "Topic", snippet, at: Date.now() }, ...marks].slice(0, 30));
    toast({ title: "Bookmarked", description: sec?.title });
  };

  // arriving from a quiz/flashcard "find in notes": jump to the topic, then to the exact paragraph
  useEffect(() => {
    if (jumped.current || sections.length === 0 || (!wantKc && !wantFind)) return;
    const t = window.setTimeout(() => {
      jumped.current = true;
      let best: { kc: string; text: string; score: number } | null = null;
      if (wantFind) {
        const pool = wantKc ? sections.filter((s) => s.id === wantKc) : sections;
        for (const s of pool) {
          const r = rankBlocks(s.lessonMarkdown || "", wantFind, 1)[0];
          if (r && (!best || r.score > best.score)) best = { kc: s.id, text: r.text, score: r.score };
        }
      }
      if (wantKc) goTo(wantKc, best?.text);
      else if (best) goTo(best.kc, best.text);
      if (best) window.setTimeout(() => flashBlock(best!.kc, best!.text), 700);
      if (wantFind) setFromRef(true);
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

  const bookmarksList = marks.length > 0 && (
    <div className="mb-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-2">Bookmarks</p>
      <ul className="space-y-0.5">
        {marks.map((m) => (
          <li key={m.id} className="flex items-start gap-1">
            <button
              type="button"
              onClick={() => {
                goTo(m.kc, m.snippet);
                if (m.snippet) window.setTimeout(() => flashBlock(m.kc, m.snippet), 650);
              }}
              className="flex-1 min-w-0 text-left rounded-lg px-2 py-1.5 hover:bg-muted"
            >
              <span className="block text-[13px] font-semibold truncate">{m.title}</span>
              {m.snippet && <span className="block text-[11px] text-muted-foreground line-clamp-2">{m.snippet}</span>}
            </button>
            <button type="button" aria-label="Remove bookmark" onClick={() => saveMarks(marks.filter((x) => x.id !== m.id))} className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-muted-foreground hover:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

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
            (active || currentFlip?.section.id || sections[0]?.id) === s.id ? "bg-brand-600/10 text-brand-700 dark:text-brand-300 font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted",
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
        <div className="h-full bg-brand-600 transition-[width] duration-150" style={{ width: "0%" }} ref={progressBar} />
      </div>

      <div className="flex flex-wrap items-center gap-2 py-3">
        <Link href={`/classes/${classId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {title}
        </Link>
        <div className="ml-auto inline-flex rounded-xl border border-border p-0.5 text-xs font-semibold bg-card" role="group" aria-label="Reading view">
          <button
            type="button"
            onClick={() => switchMode("flip")}
            className={cn("px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors", viewMode === "flip" ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground")}
          >
            <BookOpen className="h-3.5 w-3.5" /> Flipbook
          </button>
          <button
            type="button"
            onClick={() => switchMode("scroll")}
            className={cn("px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors", viewMode === "scroll" ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground")}
          >
            <Rows3 className="h-3.5 w-3.5" /> Scroll
          </button>
        </div>
        <button type="button" onClick={addBookmark} className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted" aria-label="Bookmark where I am">
          <Bookmark className="h-4 w-4" /> Bookmark
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="Text size">
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
                    goTo(r.kc.id, r.text);
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

      {resumed && !fromRef && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-sm">
          <BookOpen className="h-4 w-4 text-brand-600 shrink-0" />
          <span className="flex-1">Back where you left off.</span>
          <Button size="sm" variant="outline" onClick={() => { setResumed(false); if (viewMode === "flip") goToPage(0); else window.scrollTo({ top: 0, behavior: "smooth" }); try { localStorage.removeItem(posKey); } catch {} }}>Start from the top</Button>
        </div>
      )}
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
            {bookmarksList}
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-2">Contents</p>
            {toc}
          </div>
        </aside>

        <main
          ref={mainRef}
          className={viewMode === "flip" ? "min-w-0 space-y-4 scroll-mt-16" : "min-w-0 note-paper sunroot-paper"}
        >
          {viewMode === "flip" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div>
                  <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-tight">{title}</h1>
                  <p className="text-xs text-muted-foreground">
                    {sections.length} topics · {flipPages.length} notebook {flipPages.length === 1 ? "page" : "pages"}. Swipe or press ← → to flip. Tap highlighted words to learn more.
                  </p>
                </div>
                {currentFlip && (
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold tabular-nums">
                    Page {safeFlipIdx + 1} / {flipPages.length}
                  </span>
                )}
              </div>

              {flipPages.length === 0 ? (
                <div className="note-paper sunroot-paper">
                  <p className="text-sm text-muted-foreground">There are no topics here yet.</p>
                </div>
              ) : (
                currentFlip && (
                  <>
                    <article
                      key={currentFlip.key}
                      id={`kc-${currentFlip.section.id}`}
                      data-kc={currentFlip.section.id}
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        if (t) swipeStart.current = { x: t.clientX, y: t.clientY };
                      }}
                      onTouchEnd={(e) => {
                        const start = swipeStart.current;
                        swipeStart.current = null;
                        const t = e.changedTouches[0];
                        if (!start || !t) return;
                        const dx = t.clientX - start.x;
                        const dy = t.clientY - start.y;
                        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                          if (dx < 0 && safeFlipIdx < flipPages.length - 1) goToPage(safeFlipIdx + 1);
                          else if (dx > 0 && safeFlipIdx > 0) goToPage(safeFlipIdx - 1);
                        }
                      }}
                      className={cn(
                        "note-paper sunroot-paper touch-pan-y",
                        flipDir === "next" ? "note-flip-next" : "note-flip-prev"
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2.5 mb-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                            Topic {currentFlip.sectionIdx + 1} of {sections.length}
                            {currentFlip.pageTotalInSection > 1
                              ? ` · Part ${currentFlip.pageIdxInSection + 1}/${currentFlip.pageTotalInSection}`
                              : ""}
                            {` · ${currentFlip.readMins} min read`}
                          </p>
                          {currentFlip.section.depth === 0 ? (
                            <h2 className="text-2xl font-bold tracking-tight truncate">{currentFlip.section.title}</h2>
                          ) : (
                            <h3 className="text-xl font-bold tracking-tight truncate">{currentFlip.section.title}</h3>
                          )}
                        </div>
                        <span className="flex items-center gap-3 shrink-0">
                          {currentFlip.section.published?.lesson !== false &&
                            (currentFlip.section.lessonMarkdown || "").trim().length >= THIN && (
                              <button
                                type="button"
                                onClick={() => voice.start(currentFlip.section.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
                                aria-label={`Listen from ${currentFlip.section.title}`}
                              >
                                <Volume2 className="h-3.5 w-3.5" /> Listen
                              </button>
                            )}
                          <Link
                            href={`/classes/${classId}/topics/${currentFlip.section.id}`}
                            className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
                          >
                            Practice this topic →
                          </Link>
                        </span>
                      </div>

                      {currentFlip.section.published?.lesson === false ? (
                        <p className="text-sm text-muted-foreground">Your teacher hasn&apos;t published this note yet.</p>
                      ) : (currentFlip.section.lessonMarkdown || "").trim().length < THIN ? (
                        <div className="space-y-2">
                          {currentFlip.section.description && (
                            <p className="note-prose">{currentFlip.section.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            The full note for this topic is written the first time it is opened.{" "}
                            <Link
                              href={`/classes/${classId}/topics/${currentFlip.section.id}`}
                              className="text-brand-600 underline"
                            >
                              Open the topic
                            </Link>
                          </p>
                        </div>
                      ) : (
                        <InteractiveNote
                          bare
                          lazy
                          markdown={(currentFlip.section.lessonMarkdown || "").trim()}
                          barePageIndex={currentFlip.pageIdxInSection}
                          topicTitle={currentFlip.section.title}
                          classId={classId}
                          kcId={currentFlip.section.id}
                        />
                      )}
                    </article>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => goToPage(safeFlipIdx - 1)}
                        disabled={safeFlipIdx === 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Prev page
                      </Button>
                      <div className="flex items-center gap-1.5 overflow-x-auto max-w-[14rem] sm:max-w-xs py-1" aria-hidden>
                        {flipPages.slice(Math.max(0, safeFlipIdx - 5), Math.max(0, safeFlipIdx - 5) + 12).map((fp) => {
                          const realIdx = flipPages.indexOf(fp);
                          return (
                            <button
                              key={fp.key}
                              type="button"
                              tabIndex={-1}
                              onClick={() => goToPage(realIdx)}
                              className={cn(
                                "h-2 rounded-full transition-all shrink-0",
                                realIdx === safeFlipIdx
                                  ? "w-6 bg-brand-600"
                                  : "w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400"
                              )}
                            />
                          );
                        })}
                      </div>
                      <Button
                        type="button"
                        onClick={() => goToPage(safeFlipIdx + 1)}
                        disabled={safeFlipIdx >= flipPages.length - 1}
                      >
                        Next page <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </>
                )
              )}
            </>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mb-1">{title}</h1>
              <p className="text-sm text-muted-foreground mb-4">{sections.length} topics. Tap any highlighted word to learn more.</p>
              {sections.length === 0 && <p className="text-sm text-muted-foreground">There are no topics here yet.</p>}
              {sections.map((s) => (
                <SectionView key={s.id} s={s} classId={classId} onListen={voice.start} />
              ))}
            </>
          )}
        </main>
      </div>

      {voice.state !== "idle" && (
        <div className="fixed inset-x-3 bottom-[4.75rem] lg:bottom-4 lg:left-auto lg:right-6 lg:w-96 z-40">
          <ReadPlayer api={voice} title={listeningTitle} />
        </div>
      )}
      {voice.failed && (
        <p className="fixed bottom-24 inset-x-4 z-40 rounded-xl bg-rose-600 text-white text-sm px-3 py-2 text-center">The voice is busy right now. Try again in a moment.</p>
      )}
      <button
        type="button"
        onClick={() => setTocOpen(true)}
        className={cn("lg:hidden fixed right-4 z-40 h-12 px-4 rounded-full bg-brand-600 text-white shadow-elevated inline-flex items-center gap-2 text-sm font-semibold transition-[bottom]", voice.state !== "idle" ? "bottom-48" : "bottom-24")}
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
            {bookmarksList}
            {toc}
          </div>
        </div>
      )}
    </div>
  );
}
