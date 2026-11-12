"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { usePrefs } from "@/components/settings/use-prefs";
import { Sprout, type BotPose } from "@/components/bot/sprout";
import type { Gear } from "@/components/bot/sprout-gear";
import { MOOD_COPY, PALETTES, type PetMood } from "@/lib/pet/mood";

const W = 72;
const H = 81;
const KEY = "sunroot:bot";
export const PET_EVENT = "sunroot:pet";
export type BotMode = "lively" | "calm" | "off";

export interface PetInfo {
  name: string;
  mood: PetMood;
  gear: Gear;
  stats: { streakDays: number; daysAway: number; avgMastery: number | null; xp: number };
}

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
  mode: BotMode;
  setMode: (m: BotMode) => void;
  pet: PetInfo;
  reloadPet: () => void;
  /** run to a place on the page; resolves when Sprout has arrived (at once if the bot is off or motion is reduced) */
  hopTo: (target: Element | DOMRect, o?: HopOptions) => Promise<void>;
  rest: (say?: string) => Promise<void>;
  setPose: (p: BotPose) => void;
  say: (text: string, ms?: number) => void;
  cheer: (text?: string) => Promise<void>;
  /** run to a spot, jump for joy there, then go home (progress milestones) */
  cheerAt: (target: Element | DOMRect, text?: string) => Promise<void>;
  /** lookups so far this visit: after a few, the walk gets shorter so it never feels slow */
  quick: boolean;
  countLookup: () => void;
}

const DEFAULT_PET: PetInfo = { name: "Sprout", mood: "calm", gear: {}, stats: { streakDays: 0, daysAway: 0, avgMastery: null, xp: 0 } };
const NOOP: BotApi = {
  enabled: false,
  setEnabled: () => {},
  mode: "off",
  setMode: () => {},
  pet: DEFAULT_PET,
  reloadPet: () => {},
  hopTo: async () => {},
  rest: async () => {},
  setPose: () => {},
  say: () => {},
  cheer: async () => {},
  cheerAt: async () => {},
  quick: true,
  countLookup: () => {},
};
const BotCtx = createContext<BotApi>(NOOP);
export const useBot = () => useContext(BotCtx);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function greeting(p: PetInfo): string {
  const d = p.stats.streakDays;
  switch (p.mood) {
    case "sleepy":
      return `Zzz... I missed you. Study with me to wake ${p.name} up!`;
    case "fired":
      return `${d}-day streak! ${p.name} is on fire!`;
    case "genius":
      return `Wow, you really know your stuff. ${p.name} feels like a genius!`;
    case "happy":
      return `${d} days in a row! ${p.name} is so happy.`;
    default:
      return `Hi! I'm ${p.name}. Ready to learn?`;
  }
}

/**
 * The bot lives on a fixed layer above the page. Other components ask it to hop somewhere (to a word, to a page corner, to an
 * equation term), strike a pose, speak a short line or cheer. It is the learner's pet: it has a name, wears what they bought,
 * and its colour shows how they are doing. It can be set to lively, calm or off, and stays still for reduced motion.
 */
export function BotProvider({ children }: { children: React.ReactNode }) {
  const [prefs] = usePrefs();
  const osReduced = useReducedMotion();
  const reduce = Boolean(prefs.reduceMotion || osReduced);
  const [mode, setModeState] = useState<BotMode>("lively");
  const enabled = mode !== "off";
  const [pose, setPoseState] = useState<BotPose>("idle");
  const [facing, setFacing] = useState<1 | -1>(1);
  const [bubble, setBubble] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [landed, setLanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pet, setPet] = useState<PetInfo>(DEFAULT_PET);
  const layer = useRef<HTMLDivElement>(null);
  const at = useRef({ x: 0, y: 0 });
  const homed = useRef(true);
  const anim = useRef<Animation | null>(null);
  const moveId = useRef(0);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const lookups = useRef(0);
  const poseRef = useRef<BotPose>("idle");
  const [quick, setQuick] = useState(false);

  const setPose = useCallback((p: BotPose) => {
    poseRef.current = p;
    setPoseState(p);
  }, []);

  const home = useCallback(() => {
    const narrow = window.innerWidth < 768;
    return { x: window.innerWidth - W - 8, y: window.innerHeight - H - (narrow ? 100 : 24) };
  }, []);

  const place = useCallback((x: number, y: number) => {
    at.current = { x, y };
    if (layer.current) layer.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const loadPet = useCallback(() => {
    fetch("/api/pet")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.data) setPet({ name: j.data.name || "Sprout", mood: j.data.mood || "calm", gear: j.data.gear || {}, stats: j.data.stats || DEFAULT_PET.stats });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      const v = localStorage.getItem(KEY);
      if (v === "off" || v === "calm") setModeState(v);
    } catch {
      /* default: lively */
    }
    loadPet();
    window.addEventListener(PET_EVENT, loadPet);
    return () => window.removeEventListener(PET_EVENT, loadPet);
  }, [loadPet]);

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

  const setMode = useCallback((m: BotMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* ignore */
    }
  }, []);
  const setEnabled = useCallback((v: boolean) => setMode(v ? "lively" : "off"), [setMode]);

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
      const arc = Math.min(80, 26 + Math.hypot(tx - from.x, ty - from.y) / 7);
      setMoving(true);
      setLanded(false);
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
      setLanded(true);
      window.setTimeout(() => setLanded(false), 360);
      return true;
    },
    [place, reduce, setPose],
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
    [enabled, mounted, home, move, say, setPose],
  );

  const cheer = useCallback<BotApi["cheer"]>(
    async (text) => {
      if (!enabled || !mounted) return;
      const h = home();
      homed.current = true;
      const myMove = moveId.current + 1;
      if (!(await move(h.x, h.y, 450, "jump"))) return;
      say(text || "Nice work!", 2600);
      await sleep(reduce ? 800 : 1500);
      // only go back to idle if nothing else has taken the bot since
      if (moveId.current === myMove) setPose("idle");
    },
    [enabled, mounted, home, move, say, reduce, setPose],
  );

  const cheerAt = useCallback<BotApi["cheerAt"]>(
    async (target, text) => {
      if (!enabled || !mounted) return;
      await hopTo(target, { anchor: "below", pose: "jump", duration: 500 });
      if (text) say(text, 2400);
      await sleep(reduce ? 600 : 1500);
      await rest();
    },
    [enabled, mounted, hopTo, say, reduce, rest],
  );

  const countLookup = useCallback(() => {
    lookups.current += 1;
    if (lookups.current >= 3) setQuick(true);
  }, []);

  // a greeting once per visit, by mood
  useEffect(() => {
    if (!mounted || !enabled || pet === DEFAULT_PET) return;
    try {
      if (sessionStorage.getItem("sunroot:bot-hello")) return;
      sessionStorage.setItem("sunroot:bot-hello", "1");
    } catch {
      /* say it anyway */
    }
    const t = window.setTimeout(() => {
      if (poseRef.current !== "idle") return;
      setPose(pet.mood === "sleepy" ? "idle" : "wave");
      say(greeting(pet), 4200);
      window.setTimeout(() => poseRef.current === "wave" && setPose("idle"), 1800);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [mounted, enabled, pet, say, setPose]);

  // lively mode: now and then the bot waves, dances, hops or looks around while it waits at home
  useEffect(() => {
    if (!mounted || mode !== "lively" || reduce) return;
    let off = false;
    let timer: number;
    const next = () => {
      timer = window.setTimeout(() => {
        if (off) return;
        if (homed.current && !document.hidden && poseRef.current === "idle" && !anim.current) {
          const antics: Array<{ pose: BotPose; ms: number }> = [
            { pose: "wave", ms: 1500 },
            { pose: "dance", ms: 2800 },
            { pose: "jump", ms: 1500 },
            { pose: "think", ms: 1800 },
          ];
          const a = antics[Math.floor(Math.random() * antics.length)];
          setPose(a.pose);
          window.setTimeout(() => poseRef.current === a.pose && setPose("idle"), a.ms);
        }
        next();
      }, 14_000 + Math.random() * 14_000);
    };
    next();
    return () => {
      off = true;
      window.clearTimeout(timer);
    };
  }, [mounted, mode, reduce, setPose]);

  const api = useMemo<BotApi>(
    () => ({ enabled, setEnabled, mode, setMode, pet, reloadPet: loadPet, hopTo, rest, setPose, say, cheer, cheerAt, quick, countLookup }),
    [enabled, setEnabled, mode, setMode, pet, loadPet, hopTo, rest, setPose, say, cheer, cheerAt, quick, countLookup],
  );

  const onTap = () => {
    const tips = [...TIPS, MOOD_COPY[pet.mood].how];
    void cheer(tips[Math.floor(Math.random() * tips.length)]);
  };

  return (
    <BotCtx.Provider value={api}>
      {children}
      {mounted &&
        enabled &&
        createPortal(
          <div ref={layer} className="sunroot-bot" data-moving={moving} data-landed={landed} aria-live="polite">
            {bubble && <div className="sunroot-bot-bubble" role="status">{bubble}</div>}
            <button type="button" className="sunroot-bot-body" onClick={onTap} aria-label={`${pet.name}, your study helper. Tap for a tip.`}>
              <Sprout pose={pose} facing={facing} mood={pet.mood} palette={PALETTES[pet.mood]} gear={pet.gear} />
            </button>
          </div>,
          document.body,
        )}
    </BotCtx.Provider>
  );
}
