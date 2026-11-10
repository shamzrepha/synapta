"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { BookOpen, ChevronLeft, ChevronRight, Lightbulb, Loader2, MessageCircleQuestion, Rows3, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeMath } from "@/lib/text/readable";
import { readMinutes, splitNote } from "@/lib/study/note-sections";
import { cn } from "@/lib/utils";

interface TermCard {
  summary: string;
  keyPoints: string[];
  example: string;
  imageQuery: string;
}
interface Pic {
  url: string;
  page: string;
  title: string;
  author: string;
  license: string;
}
type Mode = "define" | "simpler" | "example";

/** The sentence or paragraph a tapped word sits in, so the explanation fits the topic. */
const ContextCtx = React.createContext<string>("");
const OpenTermCtx = React.createContext<(term: string, context: string) => void>(() => {});

function nodeText(n: React.ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join("");
  if (React.isValidElement(n)) return nodeText((n.props as { children?: React.ReactNode }).children);
  return "";
}

function Term({ children }: { children?: React.ReactNode }) {
  const ctx = React.useContext(ContextCtx);
  const open = React.useContext(OpenTermCtx);
  const text = nodeText(children).trim();
  if (!text || text.length > 60) return <strong>{children}</strong>;
  return (
    <button
      type="button"
      onClick={() => open(text, ctx)}
      className="note-term"
      aria-label={`${text}: tap for a picture and explanation`}
    >
      {children}
    </button>
  );
}

function Para({ children }: { children?: React.ReactNode }) {
  return (
    <ContextCtx.Provider value={nodeText(children).slice(0, 700)}>
      <p>{children}</p>
    </ContextCtx.Provider>
  );
}
function Item({ children }: { children?: React.ReactNode }) {
  return (
    <ContextCtx.Provider value={nodeText(children).slice(0, 700)}>
      <li>{children}</li>
    </ContextCtx.Provider>
  );
}

const MD_COMPONENTS = { strong: Term, p: Para, li: Item };

function NoteBody({ markdown }: { markdown: string }) {
  return (
    <div className="note-prose">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={MD_COMPONENTS}>
        {normalizeMath(markdown)}
      </ReactMarkdown>
    </div>
  );
}

/** The pop-up for a tapped word: pictures, what it is, key facts, an example, and "simpler" / "another example". */
function TermSheet({ term, context, topic, onClose }: { term: string; context: string; topic: string; onClose: () => void }) {
  const [card, setCard] = useState<TermCard | null>(null);
  const [pics, setPics] = useState<Pic[]>([]);
  const [picIdx, setPicIdx] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("define");
  const cache = useRef(new Map<string, TermCard>());
  const imgFor = useRef<string>("");

  const load = useCallback(
    async (m: Mode) => {
      setMode(m);
      const key = `${term}|${m}`;
      const hit = cache.current.get(key);
      if (hit) {
        setCard(hit);
        setBusy(false);
        setError(null);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/study/term", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term, context, topic, mode: m }) });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error?.message || "Couldn't explain that right now.");
        const c = j.data as TermCard;
        cache.current.set(key, c);
        setCard(c);
        // pictures are fetched once per word, from the first explanation's search phrase
        if (c.imageQuery && imgFor.current !== term) {
          imgFor.current = term;
          fetch(`/api/images/search?q=${encodeURIComponent(c.imageQuery)}`)
            .then((r) => r.json())
            .then((p) => {
              const list = Array.isArray(p?.data?.images) ? (p.data.images as Pic[]) : [];
              setPics(list.slice(0, 5));
              setPicIdx(0);
            })
            .catch(() => {});
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't explain that right now.");
      } finally {
        setBusy(false);
      }
    },
    [term, context, topic]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("define");
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pic = pics[picIdx];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center bg-black/50 p-0 sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`About ${term}`}
        onClick={(e) => e.stopPropagation()}
        className="note-sheet w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-elevated"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-card/95 backdrop-blur px-5 pt-4 pb-2">
          <h3 className="text-lg font-bold tracking-tight truncate">{term}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {pic && (
            <figure className="note-explode space-y-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pic.url} alt={pic.title || term} loading="lazy" className="w-full max-h-64 object-contain rounded-2xl bg-white border border-border" />
              <figcaption className="text-[11px] text-muted-foreground">
                <a href={pic.page} target="_blank" rel="noreferrer noopener" className="underline">{pic.author || "Wikimedia Commons"}</a>
                {pic.license ? `, ${pic.license}` : ""}
              </figcaption>
              {pics.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pics.map((p, i) => (
                    <button key={p.url} type="button" onClick={() => setPicIdx(i)} aria-label={`Picture ${i + 1}`} className={cn("h-12 w-12 shrink-0 rounded-lg overflow-hidden border-2 bg-white", i === picIdx ? "border-brand-500" : "border-transparent opacity-70")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </figure>
          )}

          {busy && !card && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking that up…
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm flex items-center gap-2">
              <span className="flex-1">{error}</span>
              <Button size="sm" variant="outline" onClick={() => load(mode)}>Try again</Button>
            </div>
          )}

          {card && (
            <div className={cn("space-y-3 transition-opacity", busy && "opacity-50")}>
              <p className="text-[15px] leading-relaxed">{card.summary}</p>
              {card.keyPoints.length > 0 && (
                <ul className="space-y-1.5 text-sm">
                  {card.keyPoints.map((k, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                      <span>{k}</span>
                    </li>
                  ))}
                </ul>
              )}
              {card.example && (
                <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 p-3 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300 mb-1 flex items-center gap-1">
                    <Lightbulb className="h-3.5 w-3.5" /> Example
                  </p>
                  {card.example}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => load("simpler")} disabled={busy}>Explain simpler</Button>
            <Button size="sm" variant="outline" onClick={() => load("example")} disabled={busy}>Another example</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The lesson as an interactive notebook: one page per heading that flips like a notebook (or all pages in one scroll),
 * key words (the bold ones) that open a picture-and-explanation card when tapped, and an "ask more" button on every page.
 */
export function InteractiveNote({ markdown, topicTitle }: { markdown: string; topicTitle?: string }) {
  const note = useMemo(() => splitNote(markdown), [markdown]);
  const [view, setView] = useState<"pages" | "scroll">("pages");
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [term, setTerm] = useState<{ term: string; context: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const total = note.pages.length;
  const page = note.pages[Math.min(idx, total - 1)];

  // a regenerated lesson can have fewer pages
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (idx > total - 1) setIdx(0);
  }, [idx, total]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === idx) return;
    setDir(next > idx ? "next" : "prev");
    setIdx(next);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const openTerm = useCallback((t: string, ctx: string) => setTerm({ term: t, context: ctx }), []);
  const topic = topicTitle || note.title || "";

  const header = (p: { id: string; title: string }, n: number) =>
    p.title ? (
      <div className="flex items-start gap-3 mb-3">
        <span className="mt-1 h-8 w-8 shrink-0 grid place-items-center rounded-full bg-brand-600 text-white text-sm font-bold" aria-hidden>
          {n + 1}
        </span>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug">{p.title}</h2>
      </div>
    ) : null;

  const askButton = (title: string) =>
    title ? (
      <Button type="button" size="sm" variant="outline" onClick={() => openTerm(title, "")}>
        <MessageCircleQuestion className="h-4 w-4 mr-1.5" /> Tell me more about this
      </Button>
    ) : null;

  return (
    <OpenTermCtx.Provider value={openTerm}>
      <div ref={top} className="scroll-mt-20 space-y-3 w-full min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {note.title && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">{note.title}</p>}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Tap a <span className="note-term pointer-events-none">highlighted word</span> for a picture and explanation
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-border p-0.5 text-xs font-semibold" role="group" aria-label="Reading view">
            <button type="button" onClick={() => setView("pages")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1.5", view === "pages" ? "bg-brand-600 text-white" : "text-muted-foreground")}>
              <BookOpen className="h-3.5 w-3.5" /> Pages
            </button>
            <button type="button" onClick={() => setView("scroll")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1.5", view === "scroll" ? "bg-brand-600 text-white" : "text-muted-foreground")}>
              <Rows3 className="h-3.5 w-3.5" /> Scroll
            </button>
          </div>
        </div>

        {view === "pages" && total > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Pages of this lesson">
            {note.pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                onClick={() => go(i)}
                className={cn("shrink-0 max-w-[11rem] truncate rounded-full border px-3 py-1.5 text-xs font-semibold", i === idx ? "border-brand-600 bg-brand-600 text-white" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {i + 1}. {p.title || "Page"}
              </button>
            ))}
          </div>
        )}

        {view === "pages" ? (
          <>
            <article key={page.id + idx} className={cn("note-paper", dir === "next" ? "note-flip-next" : "note-flip-prev")}>
              {header(page, idx)}
              <p className="text-[11px] text-muted-foreground mb-3 pl-11">{readMinutes(page.body)} min read · page {idx + 1} of {total}</p>
              <NoteBody markdown={page.body} />
              <div className="mt-5">{askButton(page.title)}</div>
            </article>
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => go(idx - 1)} disabled={idx === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div className="flex gap-1.5" aria-hidden>
                {note.pages.slice(0, 12).map((p, i) => (
                  <span key={p.id} className={cn("h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-brand-600" : "w-1.5 bg-slate-300 dark:bg-slate-700")} />
                ))}
              </div>
              <Button type="button" onClick={() => go(idx + 1)} disabled={idx >= total - 1}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {note.pages.map((p, i) => (
              <article key={p.id} className="note-paper">
                {header(p, i)}
                <NoteBody markdown={p.body} />
                <div className="mt-5">{askButton(p.title)}</div>
              </article>
            ))}
          </div>
        )}
      </div>

      {term && <TermSheet term={term.term} context={term.context} topic={topic} onClose={() => setTerm(null)} />}
    </OpenTermCtx.Provider>
  );
}
