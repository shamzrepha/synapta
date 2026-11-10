"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { buildReadQueue, type ReadChunk } from "@/lib/study/read-queue";
import { readPrefs } from "@/components/settings/use-prefs";
import { cn } from "@/lib/utils";

export interface ReadSection {
  id: string;
  title: string;
  markdown: string;
}
type State = "idle" | "loading" | "playing" | "paused";
const RATES = [1, 1.25, 1.5, 0.85];

/**
 * Reads the notes aloud with the app's neural voice, topic after topic: highlights and scrolls to the paragraph being read,
 * moves on to the next topic by itself when one ends, and can be paused, skipped or sped up.
 */
export function useReadThrough(opts: {
  sections: ReadSection[];
  /** scroll the reader to a topic (called when reading moves to it) */
  onSection: (id: string) => void;
  /** find the paragraph element on the page */
  findEl: (sectionId: string, blockText: string) => HTMLElement | null;
}) {
  const [state, setState] = useState<State>("idle");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rate, setRateState] = useState(1);
  const [autoNext, setAutoNextState] = useState(true);
  const [failed, setFailed] = useState(false);

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

      const clips = new Map<number, Promise<string | null>>();
      const clip = (k: number) => {
        if (k >= queue.length) return Promise.resolve(null);
        if (!clips.has(k)) {
          clips.set(
            k,
            fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: queue[k].text, voice: "female", lang: readPrefs().language }) })
              .then(async (r) => {
                if (!r.ok) return null;
                const u = URL.createObjectURL(await r.blob());
                urls.current.push(u);
                return u;
              })
              .catch(() => null)
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
        const url = await clip(k);
        if (mine !== token.current) return;
        if (!url) {
          setFailed(true);
          stop();
          return;
        }
        const a = (audio.current ||= new Audio());
        a.onended = null;
        a.onerror = null;
        a.src = url;
        a.playbackRate = rateRef.current;
        a.onended = () => void play(k + 1);
        a.onerror = () => {
          if (mine !== token.current) return;
          setFailed(true);
          stop();
        };
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
        const block = queue[k].block;
        if (block) {
          const el = optsRef.current.findEl(sec.id, block);
          if (el && el !== lit.current) {
            unlight();
            el.classList.add("note-reading");
            lit.current = el;
            el.scrollIntoView({ block: "center", behavior: "smooth" });
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
