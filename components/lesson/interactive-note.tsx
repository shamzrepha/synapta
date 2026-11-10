"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, Lightbulb, Loader2, Rows3, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeMath } from "@/lib/text/readable";
import { readMinutes, splitNote } from "@/lib/study/note-sections";
import { hashText, splitByTerms, termRegex } from "@/lib/study/terms";
import { getGlossary, preloadImages, type GlossaryCard } from "@/lib/study/glossary-client";
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

const TermsCtx = React.createContext<RegExp | null>(null);

/** Turns every relevant word in a paragraph into a tappable highlight (each word once per paragraph). */
function highlight(node: React.ReactNode, re: RegExp | null, used: Set<string>, open: (t: string, c: string) => void, ctx: string): React.ReactNode {
  if (!re) return node;
  if (typeof node === "string") {
    return splitByTerms(node, re, used).map((p, i) =>
      p.term ? (
        <button key={i} type="button" onClick={() => open(p.text, ctx)} className="note-term" aria-label={`${p.text}: tap for a picture and explanation`}>
          {p.text}
        </button>
      ) : (
        <React.Fragment key={i}>{p.text}</React.Fragment>
      )
    );
  }
  if (Array.isArray(node)) return node.map((n, i) => <React.Fragment key={i}>{highlight(n, re, used, open, ctx)}</React.Fragment>);
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode; className?: string }>;
    const cls = String(el.props.className || "");
    // leave existing tappable words, code, links and maths alone
    if (el.type === Term || el.type === "code" || el.type === "a" || el.type === "button" || /katex/.test(cls)) return node;
    if (el.props.children !== undefined) return React.cloneElement(el, undefined, highlight(el.props.children, re, used, open, ctx));
  }
  return node;
}

function Para({ children }: { children?: React.ReactNode }) {
  const text = nodeText(children).slice(0, 700);
  const re = React.useContext(TermsCtx);
  const open = React.useContext(OpenTermCtx);
  return (
    <ContextCtx.Provider value={text}>
      <p>{highlight(children, re, new Set(), open, text)}</p>
    </ContextCtx.Provider>
  );
}
function Item({ children }: { children?: React.ReactNode }) {
  const text = nodeText(children).slice(0, 700);
  const re = React.useContext(TermsCtx);
  const open = React.useContext(OpenTermCtx);
  return (
    <ContextCtx.Provider value={text}>
      <li>{highlight(children, re, new Set(), open, text)}</li>
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
function TermSheet({ term, context, topic, preset, onClose }: { term: string; context: string; topic: string; /** the card prepared in the background, so nothing loads */ preset?: GlossaryCard; onClose: () => void }) {
  const presetCard: TermCard | null = preset ? { summary: preset.summary, keyPoints: preset.keyPoints || [], example: preset.example || "", imageQuery: preset.imageQuery || "" } : null;
  const [card, setCard] = useState<TermCard | null>(presetCard);
  const [pics, setPics] = useState<Pic[]>((preset?.images as Pic[] | undefined) ?? []);
  const [picIdx, setPicIdx] = useState(0);
  const [busy, setBusy] = useState(!preset);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("define");
  const cache = useRef(new Map<string, TermCard>(presetCard ? [[`${term}|define`, presetCard]] : []));
  const imgFor = useRef<string>(preset?.images?.length ? term : "");

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

  // a prepared card without a picture: look one up (the prepared ones already carry their pictures)
  useEffect(() => {
    if (!preset || preset.images?.length || !preset.imageQuery) return;
    let off = false;
    fetch(`/api/images/search?q=${encodeURIComponent(preset.imageQuery)}`)
      .then((r) => r.json())
      .then((p) => !off && setPics((Array.isArray(p?.data?.images) ? (p.data.images as Pic[]) : []).slice(0, 5)))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [preset]);

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
              <button
                type="button"
                onClick={() => {
                  setPics((l) => l.filter((_, i) => i !== picIdx));
                  setPicIdx(0);
                }}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground underline"
              >
                Not the right picture? Remove it
              </button>
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
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <a href={`https://www.google.com/search?q=${encodeURIComponent(`${term} ${topic}`.trim())}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <ExternalLink className="h-3.5 w-3.5" /> Search Google
            </a>
            <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${term} ${topic}`.trim())}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <ExternalLink className="h-3.5 w-3.5" /> More pictures
            </a>
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
export function InteractiveNote({ markdown, topicTitle, bare, lazy, classId, kcId }: { markdown: string; topicTitle?: string; /** with these, the key-word cards come prepared from the class (saved once, loaded in the background) */ classId?: string; kcId?: string; /** just the text: no toolbar, no paper, no flip view (used inside the reader) */ bare?: boolean; /** pick the highlighted words only once this note scrolls into view */ lazy?: boolean }) {
  const note = useMemo(() => splitNote(markdown), [markdown]);
  const [view, setView] = useState<"pages" | "scroll">("scroll");
  const [terms, setTerms] = useState<string[]>([]);
  const [cards, setCards] = useState<Map<string, GlossaryCard>>(new Map());
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [term, setTerm] = useState<{ term: string; context: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(!lazy);

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

  // start looking up the key words only when the note is near the screen (the reader holds many topics)
  useEffect(() => {
    if (seen || !top.current || typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!seen) setSeen(true);
      return;
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setSeen(true), io.disconnect()), { rootMargin: "400px" });
    io.observe(top.current);
    return () => io.disconnect();
  }, [seen]);

  // the words worth looking up. In a class they are prepared once on the server for everyone and loaded in the background,
  // so tapping a word is instant; otherwise the AI picks them (the list is remembered on this device)
  useEffect(() => {
    if (!seen) return;
    let off = false;
    const key = `sunroot:terms:${hashText(markdown)}`;
    const legacy = () => {
      try {
        const hit = localStorage.getItem(key);
        if (hit) {
          const v = JSON.parse(hit);
          if (Array.isArray(v) && !off) setTerms(v.filter((x) => typeof x === "string"));
          return;
        }
      } catch {
        /* storage unavailable: just fetch */
      }
      if (!markdown || markdown.length < 80) return;
      fetch("/api/study/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: markdown.slice(0, 14000), topic: topicTitle || "" }) })
        .then((r) => r.json())
        .then((j) => {
          const list = Array.isArray(j?.data?.terms) ? (j.data.terms as string[]) : [];
          if (off) return;
          setTerms(list);
          if (list.length) {
            try {
              localStorage.setItem(key, JSON.stringify(list));
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {});
    };
    if (classId && kcId) {
      getGlossary(classId, kcId).then((prepared) => {
        if (off) return;
        if (!prepared || prepared.length === 0) return legacy();
        setCards(new Map(prepared.map((c) => [c.term.toLowerCase(), c])));
        setTerms(prepared.map((c) => c.term));
        preloadImages(prepared, 8);
      });
    } else {
      legacy();
    }
    return () => {
      off = true;
    };
  }, [markdown, topicTitle, seen, classId, kcId]);
  const termRe = useMemo(() => termRegex(terms), [terms]);

  const openTerm = useCallback((t: string, ctx: string) => setTerm({ term: t, context: ctx }), []);
  const topic = topicTitle || note.title || "";

  const header = (p: { id: string; title: string }) =>
    p.title ? <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug mt-2 mb-2">{p.title}</h2> : null;

  if (bare) {
    return (
      <OpenTermCtx.Provider value={openTerm}>
        <TermsCtx.Provider value={termRe}>
          <div ref={top} className="w-full min-w-0">
            {note.pages.map((p) => (
              <section key={p.id}>
                {!p.synthetic && header(p)}
                <NoteBody markdown={p.body} />
              </section>
            ))}
          </div>
        </TermsCtx.Provider>
        {term && createPortal(<TermSheet term={term.term} context={term.context} topic={topic} preset={cards.get(term.term.toLowerCase())} onClose={() => setTerm(null)} />, document.body)}
      </OpenTermCtx.Provider>
    );
  }

  return (
    <OpenTermCtx.Provider value={openTerm}>
      <TermsCtx.Provider value={termRe}>
      <div ref={top} className="scroll-mt-20 space-y-3 w-full min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {note.title && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">{note.title}</p>}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Tap any <span className="note-term pointer-events-none">highlighted word</span> to learn more
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-border p-0.5 text-xs font-semibold" role="group" aria-label="Reading view">
            <button type="button" onClick={() => setView("pages")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1.5", view === "pages" ? "bg-brand-600 text-white" : "text-muted-foreground")}>
              <BookOpen className="h-3.5 w-3.5" /> Flip pages
            </button>
            <button type="button" onClick={() => setView("scroll")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1.5", view === "scroll" ? "bg-brand-600 text-white" : "text-muted-foreground")}>
              <Rows3 className="h-3.5 w-3.5" /> Continuous
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
              {header(page)}
              <p className="text-[11px] text-muted-foreground mb-3 pl-11">{readMinutes(page.body)} min read · page {idx + 1} of {total}</p>
              <NoteBody markdown={page.body} />
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
          <article className="note-paper">
            {note.title && <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-2">{note.title}</h1>}
            {note.pages.map((p) => (
              <section key={p.id}>
                {!p.synthetic && header(p)}
                <NoteBody markdown={p.body} />
              </section>
            ))}
          </article>
        )}
      </div>

      {term && createPortal(<TermSheet term={term.term} context={term.context} topic={topic} preset={cards.get(term.term.toLowerCase())} onClose={() => setTerm(null)} />, document.body)}
    </TermsCtx.Provider>
    </OpenTermCtx.Provider>
  );
}
