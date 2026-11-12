"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, Lightbulb, Loader2, Rows3, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeMath } from "@/lib/text/readable";
import { readMinutes, splitAtomicBlocks, splitTextbookPages, type TextbookPage, type TextbookSectionKind } from "@/lib/study/note-sections";
import type { PageBudget } from "@/lib/study/page-fit";
import { Rope, type RopeHandle } from "@/components/bot/rope";
import { rappelMs } from "@/lib/pet/motion";
import { hashText, splitByTerms, termRegex } from "@/lib/study/terms";
import { getGlossary, preloadImages, type GlossaryCard } from "@/lib/study/glossary-client";
import { cn } from "@/lib/utils";
import { extractKineticScenesForPage, type KineticScene } from "@/lib/study/kinetic-parser";
import { KineticStage } from "@/components/study/kinetic-formula";
import type { ImageFilter } from "@/lib/images/commons";
import katex from "katex";
import { useBot } from "@/components/bot/bot-provider";
import type { VisualKind } from "@/lib/study/visual";
import { playCuteVoice, playPageFlipSound, playPopSound, playPopUpHaulSound, playRopeSwingSound } from "@/lib/audio/sfx";

interface TermCard {
  summary: string;
  keyPoints: string[];
  example: string;
  imageQuery: string;
  wikipediaTitle?: string;
  /** what the pop-up shows above the text: decided by the AI per word */
  visual?: VisualKind;
  formula?: string;
}
interface Pic {
  url: string;
  page: string;
  title: string;
  author: string;
  license: string;
}
type Mode = "define" | "simpler" | "example";

export interface StudySignalPayload {
  event: "term_explore" | "interactive_play" | "check_pass";
  concept?: string;
}

/** The sentence or paragraph a tapped word sits in, so the explanation fits the topic. */
const ContextCtx = React.createContext<string>("");
const OpenTermCtx = React.createContext<(term: string, context: string, el?: Element | null) => void>(() => {});

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
      onClick={(e) => open(text, ctx, e.currentTarget)}
      className="note-term"
      aria-label={`${text}: tap for a picture and explanation`}
    >
      {children}
    </button>
  );
}

const TermsCtx = React.createContext<RegExp | null>(null);

/** Turns every relevant word in a paragraph into a tappable highlight (each word once per paragraph). */
function highlight(node: React.ReactNode, re: RegExp | null, used: Set<string>, open: (t: string, c: string, el?: Element | null) => void, ctx: string): React.ReactNode {
  if (!re) return node;
  if (typeof node === "string") {
    return splitByTerms(node, re, used).map((p, i) =>
      p.term ? (
        <button key={i} type="button" onClick={(e) => open(p.text, ctx, e.currentTarget)} className="note-term" aria-label={`${p.text}: tap for a picture and explanation`}>
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

/** A table sits in its own scroll box: wide tables slide sideways instead of squeezing every column into a few letters. */
function NoteTable(props: React.ComponentPropsWithoutRef<"table">) {
  return (
    <div className="note-table" role="region" tabIndex={0} aria-label="Table, scrolls sideways">
      <table {...props} />
    </div>
  );
}

// single "~" stays plain text ("about ~5 V"); only "~~text~~" strikes through
const MD_PLUGINS = [remarkMath, [remarkGfm, { singleTilde: false }]] as NonNullable<React.ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>;
const MD_COMPONENTS = { strong: Term, p: Para, li: Item, table: NoteTable };

const KIND_CALLOUT: Record<TextbookSectionKind, { label: string; tone: string } | null> = {
  overview: { label: "Big Picture", tone: "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/25" },
  section: null,
  example: { label: "Worked Walkthrough", tone: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30" },
  mistakes: { label: "Watch Out", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25" },
  terms: { label: "Key Concepts", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25" },
  check: { label: "Self-Check", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25" },
};

function splitAnswerSpoiler(md: string): { promptMd: string; answersMd: string | null } {
  const match = /(?:^|\n)(\*{1,2}Answers?:\*{1,2}[\s\S]*)$/i.exec(md);
  if (!match || match.index === undefined) return { promptMd: md, answersMd: null };
  const promptMd = md.slice(0, match.index).trim();
  const answersMd = match[1].trim();
  return promptMd ? { promptMd, answersMd } : { promptMd: md, answersMd: null };
}

/**
 * Interleaves textbook prose with inline interactive motion figures at the exact paragraph
 * or subtopic block where the formula/concept is explained, rather than isolating them at the bottom.
 */
function buildBlendedSegments(markdown: string, pageTitle?: string) {
  const whole = extractKineticScenesForPage(markdown, pageTitle);
  const { promptMd, answersMd } = splitAnswerSpoiler(whole.cleanMarkdown);
  const blocks = splitAtomicBlocks(promptMd);
  const segments: Array<{ id: string; markdown: string; scenes: KineticScene[] }> = [];
  const usedKinds = new Set<KineticScene["kind"]>();

  let proseBuf: string[] = [];
  let placed = 0;

  const flushProse = (scenes: KineticScene[]) => {
    const md = proseBuf.join("\n\n").trim();
    if (md || scenes.length > 0) {
      segments.push({ id: `seg-${segments.length}`, markdown: md, scenes });
    }
    proseBuf = [];
  };

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    proseBuf.push(blk);
    if (placed < 2) {
      const candidate = extractKineticScenesForPage(blk, pageTitle).scenes.filter((sc) => !usedKinds.has(sc.kind));
      if (candidate.length > 0) {
        const picked = candidate[0];
        usedKinds.add(picked.kind);
        placed += 1;
        flushProse([picked]);
      }
    }
  }
  flushProse([]);

  const remaining = whole.scenes.filter((sc) => !usedKinds.has(sc.kind)).slice(0, Math.max(0, 2 - placed));
  if (remaining.length > 0) {
    if (segments.length > 0) {
      const insertAt = Math.min(segments.length - 1, Math.max(0, Math.floor(segments.length / 2)));
      segments[insertAt].scenes = [...segments[insertAt].scenes, ...remaining];
    } else {
      segments.push({ id: "seg-0", markdown: "", scenes: remaining });
    }
  }

  return { segments, answersMd };
}

function NoteBody({
  markdown,
  pageTitle,
  pageKey,
  onInteractivePlay,
  onQuickCheckPass,
}: {
  markdown: string;
  pageTitle?: string;
  pageKey?: string;
  onInteractivePlay?: () => void;
  onQuickCheckPass?: () => void;
}) {
  const { segments, answersMd } = useMemo(() => buildBlendedSegments(markdown, pageTitle), [markdown, pageTitle]);
  const [revealAnswers, setRevealAnswers] = useState(false);
  const [checkedOk, setCheckedOk] = useState(false);

  return (
    <div className="space-y-3">
      {segments.map((seg, i) => (
        <React.Fragment key={seg.id}>
          {seg.markdown && (
            <div className="note-prose">
              <ReactMarkdown remarkPlugins={MD_PLUGINS} rehypePlugins={[rehypeKatex]} components={MD_COMPONENTS}>
                {normalizeMath(seg.markdown)}
              </ReactMarkdown>
            </div>
          )}
          {seg.scenes.length > 0 && (
            <KineticStage
              variant="textbook"
              scenes={seg.scenes}
              pageKey={`${pageKey || pageTitle || "note"}-s${i}`}
              onInteract={onInteractivePlay}
            />
          )}
        </React.Fragment>
      ))}

      {answersMd && (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Try answering from memory first, then check yourself:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRevealAnswers((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted"
              >
                {revealAnswers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {revealAnswers ? "Hide answers" : "Reveal answers"}
              </button>
              <button
                type="button"
                disabled={checkedOk}
                onClick={() => {
                  setCheckedOk(true);
                  setRevealAnswers(true);
                  onQuickCheckPass?.();
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  checkedOk
                    ? "bg-emerald-600 text-white"
                    : "bg-brand-600 text-white hover:bg-brand-700"
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {checkedOk ? "Mapped! (+10 XP)" : "Got it! (+10 XP)"}
              </button>
            </div>
          </div>
          {revealAnswers && (
            <div className="note-prose text-sm pt-2 border-t border-emerald-500/20">
              <ReactMarkdown remarkPlugins={MD_PLUGINS} rehypePlugins={[rehypeKatex]} components={MD_COMPONENTS}>
                {normalizeMath(answersMd)}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The pop-up for a tapped word: topic-filtered pictures, what it is, key facts, an example, and "simpler" / "another example". */
interface Origin {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
/** Runs `fn(0..1)` once per frame for `ms`; stops early when `stop()` says so. */
function tween(ms: number, fn: (t: number) => void, stop: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      fn(t);
      if (t >= 1 || stop()) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
function waitFor(cond: () => boolean, ms: number, stop: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (cond() || stop() || performance.now() - t0 > ms) resolve();
      else window.setTimeout(tick, 60);
    };
    tick();
  });
}

function TermSheet({ term, context, topic, preset, origin, onClose }: { term: string; context: string; topic: string; /** the card prepared in the background, so nothing loads */ preset?: GlossaryCard; /** where the tapped word is: Sprout runs there first */ origin?: Origin; onClose: () => void }) {
  const bot = useBot();
  const theatrical = !!origin && bot.enabled && (bot.mode === "lively" || !bot.reduced);
  const [arrived, setArrived] = useState(!theatrical);
  const [settled, setSettled] = useState(!theatrical);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const ropeRef = useRef<RopeHandle>(null);
  const readyRef = useRef(false);
  const drop = useRef(0);
  const botRef = useRef(bot);
  useEffect(() => {
    botRef.current = bot;
  });
  // 1. Sprout runs to the tapped word with its magnifying glass (slowly and clearly enough to follow)
  useEffect(() => {
    if (!theatrical || !origin) return;
    let off = false;
    const b = botRef.current;
    b.countLookup();
    playCuteVoice("search");
    void (async () => {
      await b.hopTo(origin as DOMRect, { pose: "search", duration: 1100, say: "Let me inspect this!" });
      if (off) return;
      // Pause at the word so learner clearly sees Sprout examining it with the magnifying glass
      await new Promise((res) => window.setTimeout(res, 520));
      if (off) return;
      setArrived(true);
    })();
    return () => {
      off = true;
      void botRef.current.rest();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the pop-up is built but waits down on the ground, out of sight, until Sprout is ready to pull it up
  useLayoutEffect(() => {
    if (!theatrical || !arrived || !sheetRef.current) return;
    const el = sheetRef.current;
    drop.current = Math.max(160, window.innerHeight - el.getBoundingClientRect().top + 16);
    el.style.transform = `translateY(${drop.current}px)`;
    if (backdropRef.current) backdropRef.current.style.opacity = "0";
  }, [theatrical, arrived]);
  // 2. once the card has loaded: Sprout climbs onto the top border, fires its rope at the pop-up, hauls it up from the ground, lets go and watches
  useEffect(() => {
    if (!theatrical || !arrived) return;
    let off = false;
    const b = botRef.current;
    const el = sheetRef.current;
    const rope = ropeRef.current;
    if (!el || !rope) return;
    const stop = () => off;
    let pull: Animation | null = null;
    void (async () => {
      if (!readyRef.current) {
        b.say("Hmm, let me dig through my notes...", 3200);
        await waitFor(() => readyRef.current, 7000, stop);
        b.say("");
      }
      if (off) return;
      const r = el.getBoundingClientRect();
      const finalTop = Math.max(8, r.top - drop.current);
      // Sprout perches elevated above to haul the pop-up card up
      const pullSpot = {
        left: r.left,
        top: Math.max(8, finalTop - 56),
        width: r.width,
        height: r.height,
        right: r.left + r.width,
        bottom: Math.max(8, finalTop - 56) + r.height,
      };
      await b.hopTo(pullSpot as unknown as DOMRect, { anchor: "perch", pose: "pull", duration: 800, say: "Found it! Hauling it up..." });
      if (off) return;
      b.setPose("pull");
      const hand = () => b.handPoint();
      const edge = () => {
        const q = el.getBoundingClientRect();
        return { x: q.left + q.width / 2, y: Math.min(q.top + 5, window.innerHeight - 2) };
      };
      // hook a second rope to the top of the screen: Sprout hangs from it by one hand while the other hand hauls the card
      const a0 = b.anchorPoint();
      const hook = { x: a0 ? a0.x : window.innerWidth - 40, y: 4 };
      playRopeSwingSound();
      await tween(240, (t) => {
        const a = b.anchorPoint();
        if (a) rope.setAnchor(a, hook, easeOut(t));
      }, stop);
      if (off) return;
      // fire: the haul rope flies to the pop-up's top edge, still lying at the bottom of the screen
      playRopeSwingSound();
      await tween(650, (t) => {
        const h = hand();
        if (h) rope.set(h, edge(), easeOut(t), 0.25);
      }, stop);
      if (off) return;
      // haul: the pop-up rises from the ground, the rope pulled tight
      playPopUpHaulSound();
      const dur = 1850;
      pull = el.animate([{ transform: `translateY(${drop.current}px)` }, { transform: "translateY(0px)" }], { duration: dur, easing: "cubic-bezier(0.25, 0.9, 0.3, 1)", fill: "forwards" });
      el.style.transform = "";
      backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.8, fill: "forwards" });
      await tween(dur, () => {
        const h = hand();
        if (h) rope.set(h, edge(), 1, 0.95);
      }, stop);
      if (off) return;
      try {
        await pull.finished;
      } catch {
        /* cancelled */
      }
      if (backdropRef.current) backdropRef.current.style.opacity = "1";
      el.style.transform = "";
      pull.cancel();
      // let go: the hook comes loose and the rope whips back
      playPopSound();
      await tween(380, (t) => {
        const h = hand();
        if (h) rope.set(h, edge(), 1 - easeIn(t), 0.1);
      }, stop);
      if (off) return;

      // lower itself down the rope it hangs from: one straight, smooth descent (no hop up first, no overshoot), landing on the card's top border
      const dropMs = rappelMs(finalTop - pullSpot.top);
      const lowering = tween(dropMs + 60, () => {
        const a = b.anchorPoint();
        if (a) rope.setAnchor(a, hook, 1);
      }, stop);
      await Promise.all([b.hopTo(el, { anchor: "perch", pose: "pull", duration: dropMs, arc: 0, easing: "cubic-bezier(0.45, 0.05, 0.4, 1)", glide: true }), lowering]);
      if (off) return;

      // landed: unhook, the rope drops away, and a little giggle on the card's top border
      b.setPose("giggle");
      playCuteVoice("cheer");
      b.say("Here it is!", 1800);
      await tween(300, (t) => {
        const a = b.anchorPoint();
        if (a) rope.setAnchor(a, hook, 1 - easeIn(t));
      }, stop);
      rope.hide();
      await new Promise((res) => window.setTimeout(res, 350));
      if (off) return;
      b.setPose("idle");
      setSettled(true);
    })();
    return () => {
      off = true;
      pull?.cancel();
      rope.hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theatrical, arrived]);
  const presetCard: TermCard | null = preset ? { summary: preset.summary, keyPoints: preset.keyPoints || [], example: preset.example || "", imageQuery: preset.imageQuery || "", wikipediaTitle: preset.wikipediaTitle || "", visual: preset.visual, formula: preset.formula || "" } : null;
  const [card, setCard] = useState<TermCard | null>(presetCard);
  const [pics, setPics] = useState<Pic[]>((preset?.images as Pic[] | undefined) ?? []);
  const [picIdx, setPicIdx] = useState(0);
  const [imgFilter, setImgFilter] = useState<ImageFilter>(preset?.visual === "photo" ? "photo" : preset?.visual === "diagram" ? "diagram" : "all");
  const [imgBusy, setImgBusy] = useState(false);
  const [busy, setBusy] = useState(!preset);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("define");
  const cache = useRef(new Map<string, TermCard>(presetCard ? [[`${term}|define`, presetCard]] : []));
  const imgFor = useRef<string>(preset?.images?.length ? `${term}|all` : "");

  const fetchFilteredImages = useCallback(
    async (query: string, wiki: string | undefined, filter: ImageFilter) => {
      const q = (query || term).trim();
      if (!q) return;
      setImgBusy(true);
      try {
        const params = new URLSearchParams({ q, term, topic: topic || "", filter });
        if (wiki) params.set("wiki", wiki);
        const r = await fetch(`/api/images/search?${params.toString()}`);
        const p = await r.json();
        const list = Array.isArray(p?.data?.images) ? (p.data.images as Pic[]) : [];
        setPics(list.slice(0, 6));
        setPicIdx(0);
      } catch {
        /* ignore image failure */
      } finally {
        setImgBusy(false);
      }
    },
    [term, topic]
  );

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
        // a picture only for words the AI said need one (a photo or a diagram); formulas and ideas get none
        const f: ImageFilter = c.visual === "photo" ? "photo" : "diagram";
        const imgKey = `${term}|${f}`;
        if ((c.visual === "photo" || c.visual === "diagram") && (c.imageQuery || c.wikipediaTitle) && imgFor.current !== imgKey) {
          imgFor.current = imgKey;
          setImgFilter(f);
          void fetchFilteredImages(c.imageQuery || term, c.wikipediaTitle, f);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't explain that right now.");
      } finally {
        setBusy(false);
      }
    },
    [term, context, topic, imgFilter, fetchFilteredImages]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("define");
  }, [load]);

  useEffect(() => {
    if (!preset || preset.images?.length || (preset.visual !== "photo" && preset.visual !== "diagram") || (!preset.imageQuery && !preset.wikipediaTitle)) return;
    if (imgFor.current === `${term}|${imgFilter}`) return;
    imgFor.current = `${term}|${imgFilter}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFilteredImages(preset.imageQuery || term, preset.wikipediaTitle, imgFilter);
  }, [preset, term, imgFilter, fetchFilteredImages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeImgFilter = (next: ImageFilter) => {
    if (next === imgFilter) return;
    setImgFilter(next);
    imgFor.current = `${term}|${next}`;
    if (next === "all" && preset?.images?.length) {
      setPics(preset.images as Pic[]);
      setPicIdx(0);
      return;
    }
    void fetchFilteredImages(card?.imageQuery || preset?.imageQuery || term, card?.wikipediaTitle || preset?.wikipediaTitle, next);
  };

  const pic = pics[picIdx];
  useEffect(() => {
    readyRef.current = !!card && !busy;
  }, [card, busy]);
  useEffect(() => {
    // perched on the pop-up Sprout watches you; while a new answer is on its way it thinks
    if (theatrical && settled) botRef.current.setPose(busy ? "think" : "idle");
  }, [theatrical, settled, busy]);
  // what to show above the text: older saved cards have no decision, so a card that already carries pictures keeps them
  const visual: VisualKind = card?.visual ?? preset?.visual ?? (pics.length > 0 ? "photo" : "none");
  const showPics = visual === "photo" || visual === "diagram";
  const formulaHtml = useMemo(() => {
    const f = (card?.formula || preset?.formula || "").trim();
    if (visual !== "formula" || !f) return "";
    try {
      return katex.renderToString(f, { displayMode: true, throwOnError: false, output: "html" });
    } catch {
      return "";
    }
  }, [visual, card?.formula, preset?.formula]);

  if (!arrived) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center p-0 sm:p-4" onClick={onClose} role="presentation">
      <div ref={backdropRef} className="absolute inset-0 bg-black/50" aria-hidden="true" />
      {theatrical && <Rope ref={ropeRef} />}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        data-sprout-ok
        aria-label={`About ${term}`}
        onClick={(e) => e.stopPropagation()}
        style={theatrical ? { animation: "none" } : undefined}
        className="note-sheet relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-elevated"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-card/95 backdrop-blur px-5 pt-4 pb-2">
          <h3 className="text-lg font-bold tracking-tight truncate">{term}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {formulaHtml && (
            <div
              className="note-explode overflow-x-auto rounded-2xl border border-brand-500/25 bg-brand-500/5 px-4 py-5 text-center text-xl"
              aria-label={`Formula for ${term}`}
              dangerouslySetInnerHTML={{ __html: formulaHtml }}
            />
          )}
          {showPics && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visual Filter</span>
                <div className="inline-flex rounded-lg border border-border p-0.5 text-[11px] font-semibold" role="group" aria-label="Filter pictures">
                  {(["all", "diagram", "photo"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => changeImgFilter(f)}
                      className={cn(
                        "px-2 py-0.5 rounded-md capitalize transition-colors",
                        imgFilter === f ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {f === "all" ? "Best" : f === "diagram" ? "Diagrams" : "Photos"}
                    </button>
                  ))}
                </div>
              </div>
              {imgBusy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding accurate {imgFilter === "diagram" ? "diagrams" : imgFilter === "photo" ? "photos" : "pictures"}...
                </div>
              )}
              {!imgBusy && !pic && (
                <p className="text-xs text-muted-foreground py-1">No matching {imgFilter === "all" ? "picture" : imgFilter} found for &ldquo;{term}&rdquo; in this topic.</p>
              )}
              {!imgBusy && pic && (
                <figure className="note-explode space-y-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pic.url} alt={pic.title || term} loading="lazy" className="w-full max-h-64 object-contain rounded-2xl bg-white border border-border" />
                  <figcaption className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                    <span className="truncate">
                      <a href={pic.page} target="_blank" rel="noreferrer noopener" className="underline">{pic.author || "Wikimedia Commons"}</a>
                      {pic.license ? `, ${pic.license}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPics((l) => l.filter((_, i) => i !== picIdx));
                        setPicIdx(0);
                      }}
                      className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground underline"
                    >
                      Wrong image? Skip
                    </button>
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
            </div>
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
              <p className="text-[15px] leading-relaxed note-build note-build-1">{card.summary}</p>
              {card.keyPoints.length > 0 && (
                <ul className="space-y-1.5 text-sm note-build note-build-2">
                  {card.keyPoints.map((k, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                      <span>{k}</span>
                    </li>
                  ))}
                </ul>
              )}
              {card.example && (
                <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 p-3 text-sm note-build note-build-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300 mb-1 flex items-center gap-1">
                    <Lightbulb className="h-3.5 w-3.5" /> Example
                  </p>
                  {card.example}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1 note-build note-build-4">
            <Button size="sm" variant="outline" onClick={() => load("simpler")} disabled={busy}>Explain simpler</Button>
            <Button size="sm" variant="outline" onClick={() => load("example")} disabled={busy}>Another example</Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <a href={`https://www.google.com/search?q=${encodeURIComponent(`${term} ${topic}`.trim())}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <ExternalLink className="h-3.5 w-3.5" /> Search Google
            </a>
            <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${term} ${topic} diagram`.trim())}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <ExternalLink className="h-3.5 w-3.5" /> More pictures
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Splits a Markdown lesson into structured textbook pages (sections, subtopics, and balanced continuation pages)
 * with inline blended figures, tappable key terms, quick-check callouts, and multiple book-flip gestures.
 */
export function InteractiveNote({
  markdown,
  topicTitle,
  bare,
  barePageIndex,
  pageBudget,
  lazy,
  classId,
  kcId,
  onStudySignal,
}: {
  markdown: string;
  topicTitle?: string;
  /** with these, the key-word cards come prepared from the class (saved once, loaded in the background) */
  classId?: string;
  kcId?: string;
  /** just the text: no toolbar, no paper, no flip view (used inside the reader) */
  bare?: boolean;
  /** when bare, render only a single textbook page index for outer flipbook mode */
  barePageIndex?: number;
  /** with this, a page holds a fixed number of lines (the reader sets it from the screen); the rest runs onto the next page */
  pageBudget?: PageBudget;
  /** pick the highlighted words only once this note scrolls into view */
  lazy?: boolean;
  /** callback notified when student explores terms, interacts with simulations, or passes a quick-check */
  onStudySignal?: (sig: StudySignalPayload) => void;
}) {
  const note = useMemo(() => splitTextbookPages(markdown, pageBudget ? { budget: pageBudget } : undefined), [markdown, pageBudget]);
  const [view, setView] = useState<"pages" | "scroll">("pages");
  const swipeStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const [terms, setTerms] = useState<string[]>([]);
  const [cards, setCards] = useState<Map<string, GlossaryCard>>(new Map());
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [term, setTerm] = useState<{ term: string; context: string; origin?: Origin } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(!lazy);

  const total = note.pages.length;
  const page = note.pages[Math.min(idx, total - 1)];

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (idx > total - 1) setIdx(0);
  }, [idx, total]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === idx) return;
    playPageFlipSound();
    setDir(next > idx ? "next" : "prev");
    setIdx(next);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

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
        /* storage unavailable */
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

  const openTerm = useCallback(
    (t: string, ctx: string, el?: Element | null) => {
      const r = el?.getBoundingClientRect();
      setTerm({ term: t, context: ctx, origin: r ? { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : undefined });
      onStudySignal?.({ event: "term_explore", concept: t });
    },
    [onStudySignal]
  );
  const topic = topicTitle || note.title || "";

  const header = (p: TextbookPage) => {
    const callout = KIND_CALLOUT[p.kind];
    return (
      <div className="mb-3 space-y-1">
        {(callout || p.subtopic || p.partTotal > 1) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {callout && (
              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 font-semibold", callout.tone)}>
                {callout.label}
              </span>
            )}
            {p.subtopic && p.sectionTitle && p.subtopic !== p.sectionTitle && (
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                {p.sectionTitle}
              </span>
            )}
            {p.partTotal > 1 && (
              <span className="text-muted-foreground">
                · Page {p.partIndex + 1} of {p.partTotal}
              </span>
            )}
          </div>
        )}
        {(p.subtopic || p.title) && (
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug">
            {p.subtopic || p.title}
          </h2>
        )}
      </div>
    );
  };

  if (bare) {
    const clampedIdx =
      typeof barePageIndex === "number"
        ? Math.min(Math.max(0, barePageIndex), Math.max(0, note.pages.length - 1))
        : null;
    const pagesToShow =
      clampedIdx !== null ? note.pages.slice(clampedIdx, clampedIdx + 1) : note.pages;
    return (
      <OpenTermCtx.Provider value={openTerm}>
        <TermsCtx.Provider value={termRe}>
          <div ref={top} className="w-full min-w-0 space-y-6">
            {pagesToShow.map((p) => (
              <section key={p.id}>
                {!p.synthetic && header(p)}
                <NoteBody
                  markdown={p.body}
                  pageTitle={p.subtopic || p.title || topic}
                  pageKey={`${kcId || topic}-${p.id}-${clampedIdx ?? "all"}`}
                  onInteractivePlay={() => onStudySignal?.({ event: "interactive_play", concept: p.subtopic || p.title })}
                  onQuickCheckPass={() => onStudySignal?.({ event: "check_pass", concept: p.subtopic || p.title })}
                />
              </section>
            ))}
          </div>
        </TermsCtx.Provider>
        {term && createPortal(<TermSheet term={term.term} context={term.context} topic={topic} origin={term.origin} preset={cards.get(term.term.toLowerCase())} onClose={() => setTerm(null)} />, document.body)}
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
              <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Tap any <span className="note-term pointer-events-none">highlighted word</span> for verified diagrams & explanations
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-border p-0.5 text-xs font-semibold" role="group" aria-label="Reading view">
            <button type="button" onClick={() => setView("pages")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1.5", view === "pages" ? "bg-brand-600 text-white" : "text-muted-foreground")}>
              <BookOpen className="h-3.5 w-3.5" /> Flip book
            </button>
            <button type="button" onClick={() => setView("scroll")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1.5", view === "scroll" ? "bg-brand-600 text-white" : "text-muted-foreground")}>
              <Rows3 className="h-3.5 w-3.5" /> Continuous
            </button>
          </div>
        </div>

        {view === "pages" && total > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Pages of this textbook chapter">
            {note.pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                onClick={() => go(i)}
                className={cn("shrink-0 max-w-[12rem] truncate rounded-full border px-3 py-1.5 text-xs font-semibold", i === idx ? "border-brand-600 bg-brand-600 text-white" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {i + 1}. {p.subtopic || p.title || "Page"}{p.partTotal > 1 ? ` (${p.partIndex + 1}/${p.partTotal})` : ""}
              </button>
            ))}
          </div>
        )}

        {view === "pages" ? (
          <>
            <article
              key={page.id + idx}
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === "ArrowRight" || e.key === "PageDown") && idx < total - 1) {
                  e.preventDefault();
                  go(idx + 1);
                } else if ((e.key === "ArrowLeft" || e.key === "PageUp") && idx > 0) {
                  e.preventDefault();
                  go(idx - 1);
                }
              }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement)?.closest("button,a,input,select,textarea,figure")) return;
                swipeStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
              }}
              onPointerUp={(e) => {
                const start = swipeStart.current;
                swipeStart.current = null;
                if (!start) return;
                const sel = typeof window !== "undefined" ? window.getSelection()?.toString() : "";
                if (sel && sel.length > 0) return;
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - start.time < 900) {
                  if (dx < 0 && idx < total - 1) go(idx + 1);
                  else if (dx > 0 && idx > 0) go(idx - 1);
                }
              }}
              className={cn("note-paper sunroot-paper touch-pan-y focus:outline-none relative", dir === "next" ? "note-flip-next" : "note-flip-prev")}
            >
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => go(idx - 1)}
                  aria-label="Turn to previous page"
                  className="hidden sm:flex absolute inset-y-4 left-0 w-7 items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 text-brand-700 dark:text-brand-300 transition-opacity"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {idx < total - 1 && (
                <button
                  type="button"
                  onClick={() => go(idx + 1)}
                  aria-label="Turn to next page"
                  title="Turn page"
                  className="note-corner-curl"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
              {header(page)}
              <p className="text-[11px] text-muted-foreground mb-3">
                {readMinutes(page.body)} min read · Page {idx + 1} of {total}
              </p>
              <NoteBody
                markdown={page.body}
                pageTitle={page.subtopic || page.title || topic}
                pageKey={`${kcId || topic}-${page.id}-${idx}`}
                onInteractivePlay={() => onStudySignal?.({ event: "interactive_play", concept: page.subtopic || page.title })}
                onQuickCheckPass={() => onStudySignal?.({ event: "check_pass", concept: page.subtopic || page.title })}
              />
            </article>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => go(idx - 1)} disabled={idx === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div className="flex flex-col items-center gap-1 flex-1 min-w-[8rem] max-w-xs">
                {total > 2 ? (
                  <input
                    type="range"
                    min={0}
                    max={total - 1}
                    value={idx}
                    onChange={(e) => go(Number(e.target.value))}
                    aria-label="Flip through pages"
                    className="w-full accent-brand-600 cursor-pointer h-1.5"
                  />
                ) : (
                  <div className="flex gap-1.5" aria-hidden>
                    {note.pages.map((p, i) => (
                      <span key={p.id} className={cn("h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-brand-600" : "w-1.5 bg-slate-300 dark:bg-slate-700")} />
                    ))}
                  </div>
                )}
                {total > 1 && <span className="text-[10px] text-muted-foreground">Swipe, drag, curl corner, or ← →</span>}
              </div>
              <Button type="button" onClick={() => go(idx + 1)} disabled={idx >= total - 1}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <article className="note-paper sunroot-paper space-y-6">
            {note.title && <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-2">{note.title}</h1>}
            {note.pages.map((p) => (
              <section key={p.id}>
                {!p.synthetic && header(p)}
                <NoteBody
                  markdown={p.body}
                  pageTitle={p.subtopic || p.title || topic}
                  pageKey={`${kcId || topic}-${p.id}`}
                  onInteractivePlay={() => onStudySignal?.({ event: "interactive_play", concept: p.subtopic || p.title })}
                  onQuickCheckPass={() => onStudySignal?.({ event: "check_pass", concept: p.subtopic || p.title })}
                />
              </section>
            ))}
          </article>
        )}
      </div>

      {term && createPortal(<TermSheet term={term.term} context={term.context} topic={topic} origin={term.origin} preset={cards.get(term.term.toLowerCase())} onClose={() => setTerm(null)} />, document.body)}
    </TermsCtx.Provider>
    </OpenTermCtx.Provider>
  );
}
