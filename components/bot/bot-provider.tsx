"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { usePrefs } from "@/components/settings/use-prefs";
import { Sprout, type BotPose } from "@/components/bot/sprout";

const W = 64;
const H = 72;
const KEY = "sunroot:bot";
const TIPS = [
  "Tap any glowing word and I'll look it up!",
  "Try recalling it before you peek. It sticks better.",
  "Short bursts win. One chapter, then a quick quiz.",
  "Stuck? Ask me to explain it a different way.",
  "Mistakes are how your brain learns. Keep going!",
];

export interface HopOptions {
  pose?: BotPose;
  duration?: number;
  /** where to stand relative to the target */
  anchor?: "below" | "above" | "top-left" | "left";
  say?: string;
}
export interface BotApi {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** run to a place on the page; resolves when Sprout has arrived (at once if the bot is off or motion is reduced) */
  hopTo: (target: Element | DOMRect, o?: HopOptions) => Promise<void>;
  rest: (say?: string) => Promise<void>;
  setPose: (p: BotPose) => void;
  say: (text: string, ms?: number) => void;
  cheer: (text?: string) => Promise<void>;
  /** lookups so far this visit: after a few, the walk gets shorter so it never feels slow */
  quick: boolean;
  countLookup: () => void;
}

const NOOP: BotApi = {
  enabled: false,
  setEnabled: () => {},
  hopTo: async () => {},
  rest: async () => {},
  setPose: () => {},
  say: () => {},
  cheer: async () => {},
  quick: true,
  countLookup: () => {},
};
const BotCtx = createContext<BotApi>(NOOP);
export const useBot = () => useContext(BotCtx);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Sprout lives on a fixed layer above the page. Other components ask it to hop somewhere (to a word, to a page corner, to an
 * equation term), strike a pose, speak a short line or cheer. It can be switched off in Settings and stays still when the
 * learner asked for reduced motion.
 */
export function BotProvider({ children }: { children: React.ReactNode }) {
  const [prefs] = usePrefs();
  const osReduced = useReducedMotion();
  const reduce = Boolean(prefs.reduceMotion || osReduced);
  const [enabled, setEnabledState] = useState(true);
  const [pose, setPose] = useState<BotPose>("idle");
  const [facing, setFacing] = useState<1 | -1>(1);
  const [bubble, setBubble] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const at = useRef({ x: 0, y: 0 });
  const homed = useRef(true);
  const anim = useRef<Animation | null>(null);
  const moveId = useRef(0);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const lookups = useRef(0);
  const [quick, setQuick] = useState(false);

  const home = useCallback(() => {
    const narrow = window.innerWidth < 768;
    return { x: window.innerWidth - W - 10, y: window.innerHeight - H - (narrow ? 104 : 24) };
  }, []);

  const place = useCallback((x: number, y: number) => {
    at.current = { x, y };
    if (layer.current) layer.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      setEnabledState(localStorage.getItem(KEY) !== "off");
    } catch {
      /* default on */
    }
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const h = home();
    place(h.x, h.y);
    const onResize = () => {
      if (!homed.current) return;
      const n = home();
      place(n.x, n.y);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted, home, place]);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(KEY, v ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, []);

  const say = useCallback((text: string, ms = 2600) => {
    window.clearTimeout(bubbleTimer.current);
    if (!text) {
      setBubble(null);
      return;
    }
    setBubble(text);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  const move = useCallback(
    async (x: number, y: number, duration: number, p: BotPose): Promise<boolean> => {
      const el = layer.current;
      if (!el) return false;
      const mine = ++moveId.current;
      const from = at.current;
      const tx = clamp(x, 6, window.innerWidth - W - 6);
      const ty = clamp(y, 6, window.innerHeight - H - 6);
      setPose(p);
      if (tx !== from.x) setFacing(tx < from.x ? -1 : 1);
      if (reduce || duration <= 0) {
        place(tx, ty);
        return true;
      }
      anim.current?.cancel();
      const arc = Math.min(70, 24 + Math.hypot(tx - from.x, ty - from.y) / 8);
      setMoving(true);
      const a = el.animate(
        [
          { transform: `translate3d(${from.x}px, ${from.y}px, 0)` },
          { transform: `translate3d(${(from.x + tx) / 2}px, ${Math.min(from.y, ty) - arc}px, 0)`, offset: 0.55 },
          { transform: `translate3d(${tx}px, ${ty}px, 0)` },
        ],
        { duration, easing: "cubic-bezier(0.34, 1.2, 0.5, 1)", fill: "forwards" },
      );
      anim.current = a;
      try {
        await a.finished;
        place(tx, ty);
      } catch {
        /* a newer hop took over */
      } finally {
        if (anim.current === a) {
          a.cancel();
          anim.current = null;
          setMoving(false);
        }
      }
      // a newer move took over: leave the pose and position to it
      if (moveId.current !== mine) return false;
      setFacing(1);
      return true;
    },
    [place, reduce],
  );

  const hopTo = useCallback<BotApi["hopTo"]>(
    async (target, o = {}) => {
      if (!enabled || !mounted) return;
      const r = target instanceof Element ? target.getBoundingClientRect() : target;
      const anchor = o.anchor ?? "below";
      let x = r.left + r.width / 2 - W / 2;
      let y = r.bottom + 2;
      if (anchor === "above") y = r.top - H + 6;
      if (anchor === "top-left") {
        x = r.left - W * 0.55;
        y = r.top - H * 0.55;
      }
      if (anchor === "left") {
        x = r.left - W - 2;
        y = r.top + r.height / 2 - H / 2;
      }
      // not enough room below: stand above
      if (anchor === "below" && y + H > window.innerHeight - 6) y = r.top - H + 6;
      homed.current = false;
      if (o.say) say(o.say, 2200);
      await move(x, y, o.duration ?? 600, o.pose ?? "idle");
    },
    [enabled, mounted, move, say],
  );

  const rest = useCallback<BotApi["rest"]>(
    async (text) => {
      if (!enabled || !mounted) return;
      const h = home();
      homed.current = true;
      if (text) say(text, 2200);
      if (await move(h.x, h.y, 600, "idle")) setPose("idle");
    },
    [enabled, mounted, home, move, say],
  );

  const cheer = useCallback<BotApi["cheer"]>(
    async (text) => {
      if (!enabled || !mounted) return;
      const h = home();
      homed.current = true;
      const myMove = moveId.current + 1;
      if (!(await move(h.x, h.y, 450, "cheer"))) return;
      say(text || "Nice work!", 2600);
      await new Promise((r) => window.setTimeout(r, reduce ? 800 : 1700));
      // only go back to idle if nothing else has taken Sprout since
      if (moveId.current === myMove) setPose("idle");
    },
    [enabled, mounted, home, move, say, reduce],
  );

  const countLookup = useCallback(() => {
    lookups.current += 1;
    if (lookups.current >= 3) setQuick(true);
  }, []);

  const api = useMemo<BotApi>(() => ({ enabled, setEnabled, hopTo, rest, setPose, say, cheer, quick, countLookup }), [enabled, setEnabled, hopTo, rest, say, cheer, quick, countLookup]);

  const onTap = () => {
    void cheer(TIPS[Math.floor(Math.random() * TIPS.length)]);
  };

  return (
    <BotCtx.Provider value={api}>
      {children}
      {mounted &&
        enabled &&
        createPortal(
          <div ref={layer} className="sunroot-bot" data-moving={moving} aria-live="polite">
            {bubble && <div className="sunroot-bot-bubble" role="status">{bubble}</div>}
            <button type="button" className="sunroot-bot-body" onClick={onTap} aria-label="Sprout, your study helper. Tap for a tip.">
              <Sprout pose={pose} facing={facing} />
            </button>
          </div>,
          document.body,
        )}
    </BotCtx.Provider>
  );
}
