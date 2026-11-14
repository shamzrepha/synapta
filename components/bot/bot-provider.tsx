"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePrefs } from "@/components/settings/use-prefs";
import { Sprout, type BotPose } from "@/components/bot/sprout";
import { ANCHOR_HAND, HAUL_HAND, type Pt } from "@/lib/pet/swing";
import type { Gear } from "@/components/bot/sprout-gear";
import { PALETTES, type PetMood } from "@/lib/pet/mood";
import { playCuteVoice, playPageFlipSound } from "@/lib/audio/sfx";
import { JarvisHud } from "@/components/bot/jarvis-hud";
import { homeFor, hudPlacement, type Box } from "@/lib/pet/placement";
import { formatClock, IDLE, remainingMs, startFocus, tick, type FocusState } from "@/lib/pet/focus";
import { dayHello } from "@/lib/pet/encourage";

const W = 72;
const H = 81;
const KEY = "sunroot:bot";
export const PET_EVENT = "sunroot:pet";
/** Tapping Sprout asks the AI helper: whoever can open it (the tutor panel) marks the event handled. Otherwise Sprout gives a tip. */
export const ASK_EVENT = "sunroot:ask-ai";
/** "Read this aloud": the reader answers it with the app's real (neural) voice. Nothing uses the robotic device voice. */
export const LISTEN_EVENT = "sunroot:listen";

/** Bars fixed to the screen (the phone menu, the read-aloud player) that Sprout must not stand on. */
function readDocks(): Box[] {
  const out: Box[] = [];
  document.querySelectorAll<HTMLElement>("[data-dock]").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position !== "fixed") return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  return out;
}
export type BotMode = "lively" | "calm" | "off";

export interface PetInfo {
  name: string;
  mood: PetMood;
  gear: Gear;
  stats: { streakDays: number; daysAway: number; avgMastery: number | null; xp: number };
}



export interface HopOptions {
  pose?: BotPose;
  duration?: number;
  /** height of the hop's arc in px; 0 moves in a straight line (a lowering on a rope, a fall) */
  arc?: number;
  /** CSS easing for the whole move (a straight move only) */
  easing?: string;
  /** dangling on a rope: no running bounce, just a gentle sway */
  glide?: boolean;
  /** where to stand relative to the target */
  anchor?: "below" | "above" | "top-left" | "left" | "perch";
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
  /** run to something the learner tapped (a class card), "open" it, and stay there; the next page sends Sprout home with rest() */
  openAt: (target: Element | DOMRect, text?: string) => Promise<void>;
  /** scan core terms and headings on the page with magnifying glass */
  scanPage: () => Promise<number>;
  /** perform a celebration backflip trick */
  flip: () => Promise<void>;
  /** lookups so far this visit: after a few, the walk gets shorter */
  quick: boolean;
  countLookup: () => void;
  /** motion is reduced (system setting or ours): skip the choreography */
  reduced: boolean;
  /** where Sprout's raised hand is on screen (the rope starts there), or null when it is not shown */
  handPoint: () => { x: number; y: number } | null;
  /** where Sprout's other raised hand is (the rope it hangs from starts there) */
  anchorPoint: () => { x: number; y: number } | null;
  /** where Sprout stands now (the top-left of its box) */
  where: () => { x: number; y: number };
  /**
   * Moves Sprout along any path you give (a swing on a rope, a climb): `at(u)` is where its box is at progress 0..1, with
   * the timing already in it. Smooth, straight from the compositor; resolves when it has arrived.
   */
  path: (at: (u: number) => Pt, o: { duration: number; pose?: BotPose; glide?: boolean; face?: 1 | -1 }) => Promise<void>;
  /** keeps Sprout standing on a spot that moves (a word while the page scrolls): sets its position at once, and does nothing while it is mid-hop */
  stick: (x: number, y: number) => void;
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
  openAt: async () => {},
  scanPage: async () => 0,
  flip: async () => {},
  quick: true,
  countLookup: () => {},
  reduced: true,
  handPoint: () => null,
  anchorPoint: () => null,
  where: () => ({ x: 0, y: 0 }),
  path: async () => {},
  stick: () => {},
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
      return `${dayHello(new Date().getHours())} I'm ${p.name}. Ready to learn?`;
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
  const [facing, setFacingState] = useState<1 | -1>(1);
  const facingRef = useRef<1 | -1>(1);
  const setFacing = useCallback((f: 1 | -1) => {
    facingRef.current = f;
    setFacingState(f);
  }, []);
  const [bubble, setBubble] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [landed, setLanded] = useState(false);
  const [gliding, setGliding] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname() || "";
  const [atHome, setAtHome] = useState(true);
  const [awake, setAwake] = useState(false);
  const awakeTimer = useRef<number | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hudAnchor, setHudAnchor] = useState<Box | null>(null);
  // focus sprint: a short timer Sprout keeps watch over
  const focusRef = useRef<FocusState>(IDLE);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const [focusBreak, setFocusBreak] = useState(false);
  const lastActive = useRef(0);

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(awakeTimer.current);
    awakeTimer.current = window.setTimeout(() => setAwake(false), 6000);
  }, []);

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

  const home = useCallback(() => homeFor(window.innerWidth, window.innerHeight, W, H, readDocks()), []);

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
    async (x: number, y: number, duration: number, p: BotPose, o: { arc?: number; easing?: string; glide?: boolean } = {}): Promise<boolean> => {
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
      const arc = o.arc ?? Math.min(80, 26 + Math.hypot(tx - from.x, ty - from.y) / 7);
      setMoving(true);
      setLanded(false);
      setGliding(!!o.glide);
      // a hop has a middle keyframe (the top of the arc); a straight move has none, so its easing runs start to end
      const frames: Keyframe[] =
        arc > 0
          ? [
              { transform: `translate3d(${from.x}px, ${from.y}px, 0)` },
              { transform: `translate3d(${(from.x + tx) / 2}px, ${Math.min(from.y, ty) - arc}px, 0)`, offset: 0.55 },
              { transform: `translate3d(${tx}px, ${ty}px, 0)` },
            ]
          : [{ transform: `translate3d(${from.x}px, ${from.y}px, 0)` }, { transform: `translate3d(${tx}px, ${ty}px, 0)` }];
      const a = el.animate(frames, { duration, easing: o.easing ?? "cubic-bezier(0.34, 1.2, 0.5, 1)", fill: "forwards" });
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
          setGliding(false);
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
      if (anchor === "perch") {
        // stand on the top border of a pop-up, on its left side (the close button is on the right)
        x = r.left + 14;
        y = r.top - H + 16;
      }
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
      setAtHome(false);
      if (o.say) say(o.say, 2600);
      await move(x, y, o.duration ?? 900, o.pose ?? "idle", { arc: o.arc, easing: o.easing, glide: o.glide });
    },
    [enabled, mounted, move, say],
  );

  const path = useCallback<BotApi["path"]>(
    async (at, o) => {
      if (!enabled || !mounted) return;
      const el = layer.current;
      if (!el) return;
      const mine = ++moveId.current;
      const fit = (p: Pt): Pt => ({ x: clamp(p.x, 6, window.innerWidth - W - 6), y: clamp(p.y, 2, window.innerHeight - H - 6) });
      const end = fit(at(1));
      homed.current = false;
      setAtHome(false);
      setPose(o.pose ?? poseRef.current);
      setFacing(o.face ?? 1);
      if (reduce || o.duration <= 0) {
        place(end.x, end.y);
        return;
      }
      anim.current?.cancel();
      setMoving(true);
      setLanded(false);
      setGliding(!!o.glide);
      // many short straight pieces make a smooth curve, and the compositor runs it, so the page's own work never makes it stutter
      const steps = Math.max(12, Math.round(o.duration / 16));
      const frames: Keyframe[] = Array.from({ length: steps + 1 }, (_, i) => {
        const p = fit(at(i / steps));
        return { transform: `translate3d(${p.x}px, ${p.y}px, 0)` };
      });
      const a = el.animate(frames, { duration: o.duration, easing: "linear", fill: "forwards" });
      anim.current = a;
      try {
        await a.finished;
        place(end.x, end.y);
      } catch {
        /* a newer move took over */
      } finally {
        if (anim.current === a) {
          a.cancel();
          anim.current = null;
          setMoving(false);
          setGliding(false);
        }
      }
      if (moveId.current !== mine) return;
      setFacing(1);
      setLanded(true);
      window.setTimeout(() => setLanded(false), 360);
    },
    [enabled, mounted, place, reduce, setFacing, setPose],
  );

  const rest = useCallback<BotApi["rest"]>(
    async (text) => {
      if (!enabled || !mounted) return;
      const h = home();
      homed.current = true;
      setAtHome(true);
      if (text) say(text, 2600);
      if (await move(h.x, h.y, 900, "idle")) setPose("idle");
    },
    [enabled, mounted, home, move, say, setPose],
  );

  const cheer = useCallback<BotApi["cheer"]>(
    async (text) => {
      if (!enabled || !mounted) return;
      playCuteVoice("cheer");
      const h = home();
      homed.current = true;
      setAtHome(true);
      const myMove = moveId.current + 1;
      if (!(await move(h.x, h.y, 650, "jump"))) return;
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
      await hopTo(target, { anchor: "below", pose: "jump", duration: 800 });
      if (text) say(text, 2400);
      await sleep(reduce ? 600 : 1500);
      await rest();
    },
    [enabled, mounted, hopTo, say, reduce, rest],
  );

  const openAt = useCallback<BotApi["openAt"]>(
    async (target, text) => {
      if (!enabled || !mounted) return;
      await hopTo(target, { anchor: "top-left", pose: "search", duration: 900, say: text });
      setPose("point");
      await sleep(reduce ? 200 : 700);
      setPose("jump");
      await sleep(reduce ? 100 : 450);
      // if the page never changes (navigation failed), do not leave Sprout stranded on the card
      window.setTimeout(() => {
        if (!homed.current) void rest();
      }, 5000);
    },
    [enabled, mounted, hopTo, setPose, reduce, rest],
  );

  const countLookup = useCallback(() => {
    lookups.current += 1;
    if (lookups.current >= 3) setQuick(true);
  }, []);

  const flip = useCallback(async () => {
    if (!enabled || !mounted) return;
    playPageFlipSound();
    playCuteVoice("cheer");
    setPose("flip");
    say("Ta-da! ✨", 1800);
    await sleep(720);
    setPose("idle");
  }, [enabled, mounted, say, setPose]);

  const scanPage = useCallback(async (): Promise<number> => {
    if (!enabled || !mounted) return 0;
    setMenuOpen(false);
    wake();
    say("Scanning page with magnifying glass...", 2600);
    playCuteVoice("search");

    let candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-term], [data-interactive-callout], article h1, article h2, article h3, main h1, main h2, main h3, .katex-display, [data-card]"
      )
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    if (candidates.length === 0) {
      candidates = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, p")).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (el.textContent?.trim().length ?? 0) > 0;
      });
    }

    const targets = candidates.slice(0, 4);

    if (targets.length === 0) {
      await sleep(400);
      await flip();
      say("Looks like a clean page! Ready when you are.", 2600);
      return 0;
    }

    for (const el of targets) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
      await hopTo(el, { anchor: "top-left", pose: "search", duration: 800 });
      playCuteVoice("search");
      const prevOutline = el.style.outline;
      const prevTransition = el.style.transition;
      el.style.transition = "outline 0.3s ease";
      el.style.outline = "3px solid #0d9488";
      await sleep(550);
      el.style.outline = prevOutline;
      el.style.transition = prevTransition;
    }

    await rest();
    await flip();
    say(`Scanned ${targets.length} core concept${targets.length > 1 ? "s" : ""}! Ready to study!`, 3200);
    return targets.length;
  }, [enabled, mounted, hopTo, rest, flip, say, wake]);

  // "Show off": Sprout introduces itself and what it is wearing, dances, then does a backflip
  const showOff = useCallback(async () => {
    if (!enabled || !mounted) return;
    setMenuOpen(false);
    wake();
    playCuteVoice("cheer");
    const worn = Object.values(pet.gear || {}).filter(Boolean).length;
    const streak = pet.stats.streakDays;
    say(`I'm ${pet.name}!${worn ? ` Wearing ${worn} cool thing${worn > 1 ? "s" : ""}.` : ""}${streak ? ` ${streak}-day streak!` : ""}`, 4200);
    setPose("dance");
    await sleep(reduce ? 600 : 1600);
    await flip();
  }, [enabled, mounted, pet, say, setPose, reduce, flip, wake]);

  // focus sprint: start or stop a short timer; Sprout keeps watch, cheers halfway and at the end, then calls a break
  const toggleSprint = useCallback(
    (minutes = 10) => {
      setMenuOpen(false);
      wake();
      if (focusRef.current.phase !== "idle") {
        focusRef.current = IDLE;
        setFocusLabel(null);
        setFocusBreak(false);
        say("Sprint stopped. No worries, come back any time.", 2800);
        return;
      }
      focusRef.current = startFocus(Date.now(), minutes);
      setFocusLabel(formatClock(minutes * 60_000));
      setFocusBreak(false);
      playCuteVoice("happy");
      say(`${minutes}-minute focus sprint! I'll keep watch. Go!`, 3600);
      setPose("think");
      window.setTimeout(() => poseRef.current === "think" && setPose("idle"), 1600);
    },
    [say, setPose, wake],
  );
  useEffect(() => {
    if (!mounted || !enabled) return;
    const t = window.setInterval(() => {
      const st = focusRef.current;
      if (st.phase === "idle") return;
      const now = Date.now();
      const r = tick(st, now);
      focusRef.current = r.state;
      setFocusLabel(r.state.phase === "idle" ? null : formatClock(remainingMs(r.state, now)));
      setFocusBreak(r.state.phase === "break");
      if (r.event === "halfway") say("Halfway there! Keep going, you've got this.", 3200);
      if (r.event === "focus-done") void cheer(`Sprint done! Take a ${Math.round((r.state.endsAt - now) / 60_000)}-minute break: stretch and sip some water.`);
      if (r.event === "break-done") {
        setPose("wave");
        say("Break over. Ready for another sprint?", 3600);
        window.setTimeout(() => poseRef.current === "wave" && setPose("idle"), 1800);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [mounted, enabled, say, cheer, setPose]);

  // napping: nobody has touched the screen for about a minute and a half, so Sprout dozes off; any touch wakes it
  useEffect(() => {
    if (!mounted || !enabled) return;
    lastActive.current = Date.now();
    const bump = () => {
      lastActive.current = Date.now();
      if (poseRef.current === "nap") {
        setPose("wave");
        say("Oh, you're back!", 2200);
        window.setTimeout(() => poseRef.current === "wave" && setPose("idle"), 1400);
      }
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const t = window.setInterval(() => {
      if (mode !== "lively" || reduce || !homed.current || anim.current || menuOpen || document.hidden) return;
      if (poseRef.current !== "idle" || focusRef.current.phase === "focus") return; // keeps watch during a sprint
      if (Date.now() - lastActive.current > 90_000) setPose("nap");
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
      window.clearInterval(t);
    };
  }, [mounted, enabled, mode, reduce, menuOpen, say, setPose]);

  // a bar that appears or disappears under Sprout (the read-aloud player, the phone menu): hop up onto it or back down
  useEffect(() => {
    if (!mounted || !enabled) return;
    const t = window.setInterval(() => {
      if (!homed.current || anim.current || document.hidden) return;
      const n = home();
      const c = at.current;
      if (Math.abs(n.x - c.x) > 3 || Math.abs(n.y - c.y) > 3) void move(n.x, n.y, reduce ? 0 : 520, "idle");
    }, 700);
    return () => window.clearInterval(t);
  }, [mounted, enabled, home, move, reduce]);

  // the menu follows Sprout if the screen changes (turning the phone)
  useEffect(() => {
    if (!menuOpen) return;
    const onResize = () => {
      const r = layer.current?.getBoundingClientRect();
      if (r) setHudAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [menuOpen]);

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

  const handPoint = useCallback(() => {
    const el = layer.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // the raised hand with the launcher, as a share of the 100 x 112 drawing
    return { x: r.left + r.width * (facingRef.current === -1 ? 1 - HAUL_HAND.x : HAUL_HAND.x), y: r.top + r.height * HAUL_HAND.y };
  }, []);

  const anchorPoint = useCallback(() => {
    const el = layer.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // the left hand, raised: a share of the 100 x 112 drawing
    return { x: r.left + r.width * (facingRef.current === -1 ? 1 - ANCHOR_HAND.x : ANCHOR_HAND.x), y: r.top + r.height * ANCHOR_HAND.y };
  }, []);

  // where Sprout is right now, even in the middle of a hop (so a new hop starts from where it really is, never from a stale spot)
  const where = useCallback(() => {
    const el = layer.current;
    if (el && anim.current) {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top };
    }
    return { ...at.current };
  }, []);

  const stick = useCallback<BotApi["stick"]>(
    (x, y) => {
      if (!enabled || !mounted || anim.current) return;
      const p = { x: clamp(x, 4, window.innerWidth - W - 4), y: clamp(y, 2, window.innerHeight - H - 6) };
      if (Math.abs(p.x - at.current.x) < 0.5 && Math.abs(p.y - at.current.y) < 0.5) return;
      homed.current = false;
      place(p.x, p.y);
    },
    [enabled, mounted, place],
  );

  const api = useMemo<BotApi>(
    () => ({ enabled, setEnabled, mode, setMode, pet, reloadPet: loadPet, hopTo, rest, setPose, say, cheer, cheerAt, openAt, scanPage, flip, quick, countLookup, reduced: reduce, handPoint, anchorPoint, where, path, stick }),
    [enabled, setEnabled, mode, setMode, pet, loadPet, hopTo, rest, setPose, say, cheer, cheerAt, openAt, scanPage, flip, quick, countLookup, reduce, handPoint, anchorPoint, where, path, stick],
  );

  // the speech bubble always stays fully on screen: Sprout can stand at either edge, and the bubble slides in to fit
  useEffect(() => {
    if (!bubble || menuOpen) return;
    const first = layer.current?.querySelector<HTMLElement>(".sunroot-bot-bubble");
    if (first) first.style.translate = "";
    let raf = 0;
    let shift = 0;
    let last = 0;
    // Sprout moves on the compositor, so measuring it every frame and nudging the bubble by a fraction of a pixel makes the
    // words shimmer (the nudge always lags one frame behind). Instead: look a few times a second, move in whole pixels, and let
    // CSS ease the change.
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 100) return;
      last = now;
      const el = layer.current?.querySelector<HTMLElement>(".sunroot-bot-bubble");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = r.left - shift;
      const right = r.right - shift;
      const margin = 8;
      let want = 0;
      if (left < margin) want = margin - left;
      else if (right > window.innerWidth - margin) want = window.innerWidth - margin - right;
      want = Math.round(want);
      if (Math.abs(want - shift) >= 2) {
        shift = want;
        el.style.translate = `${shift}px 0`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bubble, menuOpen]);

  // the eyes follow the finger or pointer (a little, so it feels alive but never distracting)
  useEffect(() => {
    if (!mounted || !enabled || reduce) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = layer.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.55);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 160);
        el.style.setProperty("--ex", String(((dx / d) * k).toFixed(2)));
        el.style.setProperty("--ey", String(((dy / d) * k).toFixed(2)));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mounted, enabled, reduce]);

  // reading a chapter or topic: Sprout waits small, half behind the screen edge, so it never covers the text
  const reading = /^\/classes\/[^/]+\/(read|topics)(\/|$)/.test(pathname);
  const side: "left" | "right" = "right";
  const peek = reading && atHome && !awake && !moving && !bubble;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onClickAway = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".sunroot-jarvis-hud") || target?.closest(".sunroot-bot") || target?.closest(".sunroot-bot-body")) return;
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClickAway);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClickAway);
    };
  }, [menuOpen]);

  // "Listen": the reader reads the chapter with the app's neural voice. Off the reader there is nothing to read, so say so.
  const onReadAloud = useCallback(() => {
    setMenuOpen(false);
    wake();
    const ev = new CustomEvent(LISTEN_EVENT, { detail: { handled: false } });
    window.dispatchEvent(ev);
    if ((ev.detail as { handled: boolean }).handled) {
      say("Reading it out loud!", 2200);
      setPose("dance");
      window.setTimeout(() => poseRef.current === "dance" && setPose("idle"), 1800);
    } else {
      say("Open a chapter in the reader and tap Listen. I'll read it with a real voice.", 4200);
    }
  }, [say, setPose, wake]);

  // tapping Sprout toggles the Jarvis Desk Buddy HUD
  const onTap = () => {
    wake();
    playCuteVoice("happy");
    const r = layer.current?.getBoundingClientRect();
    if (r) setHudAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    setMenuOpen((prev) => !prev);
  };

  return (
    <BotCtx.Provider value={api}>
      {children}
      {mounted &&
        enabled &&
        createPortal(
          <>
            <JarvisHud
              pet={pet}
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onScan={scanPage}
              onExplain={() => {
                setMenuOpen(false);
                wake();
                say("Asking tutor to break this down simply...", 2200);
                const ev = new CustomEvent(ASK_EVENT, {
                  detail: {
                    handled: false,
                    prompt: "Can you explain the main idea of this lesson simply in plain English with a clear example?",
                  },
                });
                window.dispatchEvent(ev);
                window.setTimeout(() => {
                  if (!(ev.detail as { handled: boolean }).handled) {
                    say("Here is the key takeaway: Learn core terms first, then test yourself!", 4000);
                  }
                }, 400);
              }}
              onQuiz={() => {
                setMenuOpen(false);
                wake();
                say("Starting recall challenge...", 2200);
                const ev = new CustomEvent(ASK_EVENT, {
                  detail: {
                    handled: false,
                    prompt: "Give me 1 rapid-fire conceptual recall check question based on what we're learning right now. Wait for my answer before revealing if I'm right!",
                  },
                });
                window.dispatchEvent(ev);
                window.setTimeout(() => {
                  if (!(ev.detail as { handled: boolean }).handled) {
                    say("Quick check: Can you explain this concept in your own words without looking?", 4500);
                  }
                }, 400);
              }}
              onReadAloud={onReadAloud}
              placement={hudAnchor ? hudPlacement(hudAnchor, window.innerWidth, window.innerHeight, readDocks()) : null}
              onFlip={flip}
              focusLabel={focusLabel}
              onFocus={() => toggleSprint(10)}
              onShowOff={showOff}
              onAskTutor={() => {
                setMenuOpen(false);
                wake();
                const ev = new CustomEvent(ASK_EVENT, { detail: { handled: false } });
                window.dispatchEvent(ev);
                window.setTimeout(() => {
                  if (!(ev.detail as { handled: boolean }).handled) {
                    say("I'm here! What would you like help with?", 3500);
                  }
                }, 400);
              }}
            />
            <div ref={layer} className="sunroot-bot" data-moving={moving} data-glide={gliding} data-landed={landed} data-peek={peek} data-side={side} aria-live="polite">
              {bubble && !menuOpen && <div className="sunroot-bot-bubble" role="status">{bubble}</div>}
              {focusLabel && (
                <div className="sunroot-bot-timer" data-break={focusBreak} aria-label={focusBreak ? "Break time left" : "Focus time left"}>
                  {focusBreak ? "break " : ""}
                  {focusLabel}
                </div>
              )}
              <button
                type="button"
                className="sunroot-bot-body"
                onClick={onTap}
                onTouchStart={wake}
                onPointerEnter={wake}
                onFocus={wake}
                aria-label={`Ask ${pet.name}, your study helper`}
                title={`Ask ${pet.name}`}
              >
                <Sprout pose={pose} facing={facing} mood={pet.mood} palette={PALETTES[pet.mood]} gear={pet.gear} />
              </button>
            </div>
          </>,
          document.body,
        )}
    </BotCtx.Provider>
  );
}
