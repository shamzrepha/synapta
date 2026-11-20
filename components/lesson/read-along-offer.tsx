"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { useBot } from "@/components/bot/bot-provider";
import { usePrefs } from "@/components/settings/use-prefs";
import { OFFER_AUTO_DISMISS_MS, OFFER_SCROLL_DISMISS_PX, READ_PACES, shouldOfferReadAlong, type ReadPace } from "@/lib/study/read-offer";
import { cn } from "@/lib/utils";

/** when the learner last touched the page and when an offer was last shown (this tab's session) */
const seen = { offerAt: 0, activeAt: 0 };

/**
 * When a readable class book page opens, Sprout hops in by itself and asks "Ready to read with me?" with a pace.
 * It never blocks the page: it sits low on the screen, goes away on scroll or after 12 seconds, and can be silenced for good.
 */
export function ReadAlongOffer({ pageKey, hasReadableText, voiceIdle, mode, onStart }: {
  /** changes when a different page opens */
  pageKey: string;
  hasReadableText: boolean;
  voiceIdle: boolean;
  mode: "flip" | "scroll";
  onStart: (rate: ReadPace) => void;
}) {
  const bot = useBot();
  const [prefs, update] = usePrefs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);
  const live = useRef({ bot, prefs, voiceIdle, hasReadableText, mode });
  useEffect(() => {
    live.current = { bot, prefs, voiceIdle, hasReadableText, mode };
  });

  // note that the learner is active, so a long pause can be told from reading
  useEffect(() => {
    const mark = () => {
      seen.activeAt = Date.now();
    };
    seen.activeAt = seen.activeAt || Date.now();
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    void live.current.bot.rest();
  }, []);

  // a page opened: after a moment (the page settles first) decide whether to offer
  useEffect(() => {
    const t = window.setTimeout(() => {
      const l = live.current;
      const ok = shouldOfferReadAlong({
        botEnabled: l.bot.enabled,
        offerOn: l.prefs.readOffer,
        hasReadableText: l.hasReadableText,
        voiceIdle: l.voiceIdle,
        mode: l.mode,
        scrollY: window.scrollY,
        now: Date.now(),
        lastOfferAt: seen.offerAt,
        lastActiveAt: seen.activeAt,
      });
      if (!ok) return;
      seen.offerAt = Date.now();
      seen.activeAt = Date.now();
      setOpen(true);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [pageKey]);

  // while it is up: Sprout hops in beside it, it goes away after 12 s, on scroll, on Escape or when reading starts
  useEffect(() => {
    if (!open) return;
    const b = live.current.bot;
    if (box.current) void b.hopTo(box.current, { anchor: "left", pose: "point", duration: 380 }).catch(() => {});
    if (document.activeElement === document.body) startBtn.current?.focus({ preventScroll: true });
    const y0 = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - y0) > OFFER_SCROLL_DISMISS_PX) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const timer = window.setTimeout(close, OFFER_AUTO_DISMISS_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // reading started some other way, or the page changed away from text
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && (!voiceIdle || !hasReadableText)) setOpen(false);
  }, [open, voiceIdle, hasReadableText]);

  if (!open) return null;
  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Read this page with Sprout"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 shadow-elevated md:bottom-8"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Volume2 className="h-4 w-4 text-brand-600" aria-hidden /> Ready to read with me?
      </p>
      <div role="radiogroup" aria-label="Reading pace" className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border p-0.5 text-xs font-semibold">
        {READ_PACES.map((p) => (
          <button
            key={p.rate}
            type="button"
            role="radio"
            aria-checked={prefs.readPace === p.rate}
            onClick={() => update({ readPace: p.rate })}
            className={cn("rounded-lg px-2 py-1.5", prefs.readPace === p.rate ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          ref={startBtn}
          type="button"
          onClick={() => {
            setOpen(false);
            onStart(prefs.readPace);
          }}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Start reading
        </button>
        <button type="button" onClick={close} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
          Not now
        </button>
      </div>
      <label className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        Don&apos;t ask again
        <button
          type="button"
          role="switch"
          aria-checked={!prefs.readOffer}
          aria-label="Don't ask again"
          onClick={() => update({ readOffer: !prefs.readOffer })}
          className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", !prefs.readOffer ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", !prefs.readOffer ? "left-[18px]" : "left-0.5")} />
        </button>
      </label>
    </div>
  );
}
