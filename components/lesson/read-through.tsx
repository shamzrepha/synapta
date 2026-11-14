"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { buildReadQueue, type ReadChunk } from "@/lib/study/read-queue";
import { readPrefs } from "@/components/settings/use-prefs";
import { useBot } from "@/components/bot/bot-provider";
import { robotAudio } from "@/lib/audio/robot-voice";
import { clearReadingHighlights, followReading, type Follower } from "./reading-follow";
import { estimateWordTimings, type WordTiming } from "@/lib/voice/word-timing";
import { cn } from "@/lib/utils";

export interface ReadSection {
  id: string;
  title: string;
  markdown: string;
}
type State = "idle" | "loading" | "playing" | "paused";
interface Clip {
  url: string;
  /** when each word is said (only for Sprout's reading voice) */
  words: WordTiming[] | null;
}

function base64ToUrl(b64: string, mime: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
const RATES = [1, 1.25, 1.5, 0.85];

/**
 * Reads the notes aloud with the app's neural voice, topic after topic: highlights and scrolls to the paragraph being read,
 * moves on to the next topic by itself when one ends, and can be paused, skipped or sped up.
 */
export function useReadThrough(opts: {
  sections: ReadSection[];
  /** scroll the reader to a topic (called when reading moves to it) */
  onSection: (id: string) => void;
  /** find the paragraph element on the page (may turn the page first when the paragraph is on another page) */
  findEl: (sectionId: string, blockText: string) => HTMLElement | null | Promise<HTMLElement | null>;
}) {
  const [state, setState] = useState<State>("idle");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rate, setRateState] = useState(1);
  const [autoNext, setAutoNextState] = useState(true);
  const [failed, setFailed] = useState(false);
  // Sprout reads along: it lights the word being said and stands on it
  const bot = useBot();
  const botRef = useRef(bot);
  useEffect(() => {
    botRef.current = bot;
  });
  const follower = useRef<Follower | null>(null);
  const cursor = useRef<{ el: HTMLElement | null; next: number }>({ el: null, next: 0 });
  const active = useRef(false);

  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const audio = useRef<HTMLAudioElement | null>(null);
  const token = useRef(0);
  const rateRef = useRef(1);
  const autoRef = useRef(true);
  const urls = useRef<string[]>([]);
  const lit = useRef<HTMLElement | null>(null);
  const startRef = useRef<(index: number) => void>(() => {});

  const unlight = () => {
    lit.current?.classList.remove("note-reading");
    lit.current = null;
  };
  const cleanup = () => {
    urls.current.splice(0).forEach((u) => URL.revokeObjectURL(u));
  };

  const stop = useCallback(() => {
    token.current++;
    follower.current?.stop();
    follower.current = null;
    clearReadingHighlights();
    if (active.current) {
      active.current = false;
      void botRef.current.rest();
    }
    const a = audio.current;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.pause();
    }
    unlight();
    cleanup();
    setState("idle");
    setCurrentId(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const startSection = useCallback(
    (index: number) => {
      const secs = optsRef.current.sections;
      // skip topics with nothing to read
      let i = index;
      let queue: ReadChunk[] = [];
      while (i >= 0 && i < secs.length) {
        queue = secs[i].markdown.trim().length > 0 ? buildReadQueue(secs[i].title, secs[i].markdown) : [];
        if (queue.length > 1) break;
        i += index >= 0 && i >= index ? 1 : -1;
      }
      if (i < 0 || i >= secs.length || queue.length === 0) {
        stop();
        return;
      }
      const sec = secs[i];
      token.current++;
      const mine = token.current;
      cleanup();
      unlight();
      setCurrentId(sec.id);
      setFailed(false);
      optsRef.current.onSection(sec.id);

      const clips = new Map<number, Promise<Clip | null>>();
      const clip = (k: number) => {
        if (k >= queue.length) return Promise.resolve(null);
        if (!clips.has(k)) {
          clips.set(
            k,
            (async (): Promise<Clip | null> => {
              const lang = readPrefs().language;
              // Sprout's own reading voice (small, bright, with word timings) for English; other languages use the regular reader
              if (!lang || lang === "en") {
                try {
                  const r = await fetch("/api/tts/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: queue[k].text }) });
                  const j = r.ok ? await r.json() : null;
                  if (j?.ok && typeof j.data?.audioBase64 === "string") {
                    const url = base64ToUrl(j.data.audioBase64, j.data.mimeType || "audio/mpeg");
                    urls.current.push(url);
                    return { url, words: Array.isArray(j.data.words) ? (j.data.words as WordTiming[]) : null };
                  }
                } catch {
                  /* fall back below */
                }
              }
              try {
                const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: queue[k].text, voice: "female", lang, reader: true }) });
                if (!r.ok) return null;
                const u = URL.createObjectURL(await r.blob());
                urls.current.push(u);
                return { url: u, words: null };
              } catch {
                return null;
              }
            })()
          );
        }
        return clips.get(k)!;
      };

      const play = async (k: number): Promise<void> => {
        if (mine !== token.current) return;
        if (k >= queue.length) {
          const nextIdx = i + 1;
          if (autoRef.current && nextIdx < secs.length) startRef.current(nextIdx);
          else stop();
          return;
        }
        setState("loading");
        void clip(k + 1);
        void clip(k + 2);
        const got = await clip(k);
        if (mine !== token.current) return;
        const url = got?.url;
        if (!got || !url) {
          setFailed(true);
          stop();
          return;
        }
        // the paragraph being read: turn the page to it first when it is on another page, so the reader never reads off-screen
        const block = queue[k].block;
        let el: HTMLElement | null = null;
        if (block) {
          try {
            el = await Promise.resolve(optsRef.current.findEl(sec.id, block));
          } catch {
            el = null;
          }
          if (mine !== token.current) return;
        }
        // every voice goes through the same small robot effect, so it sounds like the app's AI reading to you
        const ra = robotAudio();
        ra.wake();
        const a = (audio.current = ra.el);
        follower.current?.stop();
        follower.current = null;
        a.onended = null;
        a.onerror = null;
        a.onloadedmetadata = null;
        a.src = url;
        a.playbackRate = rateRef.current;
        a.onended = () => void play(k + 1);
        a.onerror = () => {
          if (mine !== token.current) return;
          setFailed(true);
          stop();
        };
        // a voice with no word timings (the fallback reader) still gets Sprout walking along: the words are spread over the clip's length
        if (!got.words && el && Number.isNaN(a.duration)) {
          await new Promise<void>((res) => {
            const t = window.setTimeout(res, 1500);
            a.onloadedmetadata = () => {
              window.clearTimeout(t);
              res();
            };
          });
          if (mine !== token.current) return;
        }
        try {
          await a.play();
        } catch {
          if (mine === token.current) {
            setFailed(true);
            stop();
          }
          return;
        }
        if (mine !== token.current) return;
        setState("playing");
        if (block && el) {
          if (el !== lit.current) {
            unlight();
            el.classList.add("note-reading");
            lit.current = el;
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          }
          // word by word: light the word, stand Sprout on it, hop to the next (waits a moment for the scroll to settle)
          const words = got.words?.length ? got.words : Number.isFinite(a.duration) && a.duration > 0 ? estimateWordTimings(queue[k].text, a.duration * 1000) : [];
          if (words.length) {
            if (cursor.current.el !== el) cursor.current = { el, next: 0 };
            active.current = true;
            window.setTimeout(() => {
              if (mine !== token.current || a.ended) return;
              follower.current?.stop();
              const f = followReading({ audio: a, words, root: el, from: cursor.current.next, bot: botRef.current });
              cursor.current = { el, next: f.next };
              follower.current = f;
            }, k === 0 || cursor.current.next === 0 ? 450 : 0);
          }
        }
      };
      void play(0);
    },
    [stop]
  );

  useEffect(() => {
    startRef.current = startSection;
  }, [startSection]);

  const start = useCallback(
    (id: string) => {
      const i = optsRef.current.sections.findIndex((s) => s.id === id);
      if (i >= 0) startSection(i);
    },
    [startSection]
  );
  const pause = useCallback(() => {
    audio.current?.pause();
    setState((s) => (s === "playing" || s === "loading" ? "paused" : s));
  }, []);
  const resume = useCallback(() => {
    void audio.current?.play().then(() => setState("playing"));
  }, []);
  const skip = useCallback(
    (by: 1 | -1) => {
      const secs = optsRef.current.sections;
      setCurrentId((cur) => {
        const i = secs.findIndex((s) => s.id === cur);
        if (i >= 0) window.setTimeout(() => startSection(Math.max(0, Math.min(secs.length - 1, i + by))), 0);
        return cur;
      });
    },
    [startSection]
  );
  const cycleRate = useCallback(() => {
    const next = RATES[(RATES.indexOf(rateRef.current) + 1) % RATES.length];
    rateRef.current = next;
    setRateState(next);
    if (audio.current) audio.current.playbackRate = next;
  }, []);
  const setAutoNext = useCallback((v: boolean) => {
    autoRef.current = v;
    setAutoNextState(v);
  }, []);

  return { state, currentId, rate, autoNext, failed, start, stop, pause, resume, skip, cycleRate, setAutoNext };
}

export function ReadPlayer({ api, title, className }: { api: ReturnType<typeof useReadThrough>; title: string; className?: string }) {
  if (api.state === "idle") return null;
  const busy = api.state === "loading";
  return (
    <div role="region" aria-label="Listening controls" className={cn("rounded-2xl border border-border bg-card/95 backdrop-blur shadow-elevated px-3 py-2.5", className)}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">{busy ? "Getting the voice ready" : api.state === "paused" ? "Paused" : "Listening"}</p>
          <p className="text-sm font-semibold truncate">{title}</p>
        </div>
        <button type="button" onClick={() => api.skip(-1)} aria-label="Previous topic" className="h-10 w-10 grid place-items-center rounded-full hover:bg-muted"><SkipBack className="h-4 w-4" /></button>
        <button
          type="button"
          onClick={() => (api.state === "paused" ? api.resume() : api.pause())}
          aria-label={api.state === "paused" ? "Resume" : "Pause"}
          className="h-11 w-11 grid place-items-center rounded-full bg-brand-600 text-white"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : api.state === "paused" ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </button>
        <button type="button" onClick={() => api.skip(1)} aria-label="Next topic" className="h-10 w-10 grid place-items-center rounded-full hover:bg-muted"><SkipForward className="h-4 w-4" /></button>
        <button type="button" onClick={api.stop} aria-label="Stop listening" className="h-10 w-10 grid place-items-center rounded-full hover:bg-muted"><Square className="h-4 w-4" /></button>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1.5 text-xs">
        <button type="button" onClick={api.cycleRate} className="rounded-lg border border-border px-2 py-1 font-semibold tabular-nums" aria-label="Change speed">{api.rate}×</button>
        <label className="flex items-center gap-1.5 font-semibold text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={api.autoNext} onChange={(e) => api.setAutoNext(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand-600,#2563eb)]" />
          Go to the next topic automatically
        </label>
      </div>
    </div>
  );
}
