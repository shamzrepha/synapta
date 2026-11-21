"use client";

import { useEffect } from "react";
import type { PetMood } from "@/lib/pet/mood";
import { drawSprout } from "@/lib/favicon/draw";
import {
  BURST_FPS, FAVICON_EVENT_NAME, HIDDEN_PAUSE_MS, IDLE_SLEEPY_MS,
  burstFrame, isFaviconEvent, nextBlinkDelay, staticFrame, tooSoon, type FaviconEvent, type FaviconFrame,
} from "@/lib/favicon/frames";

const LINK_ID = "sunroot-favicon";
const MOODS: PetMood[] = ["sleepy", "calm", "happy", "fired", "genius"];

/** Fire a favicon reaction from anywhere in the client. Safe on the server (no-op). */
export function faviconEvent(kind: FaviconEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FAVICON_EVENT_NAME, { detail: { kind } }));
}

/**
 * Sprout as the tab icon. Idle: a still mood frame with a blink every 6-10 s. Events play a short burst
 * (8 frames at 6 fps) and then stop. Paused for reduced motion and after 2 min of a hidden tab.
 * Browsers that ignore icon updates just keep the last static frame (see docs/design/FAVICON.md).
 */
export function AnimatedFavicon({ fetchMood = true }: { fetchMood?: boolean }) {
  useEffect(() => {
    let mood: PetMood = "calm";
    let lastDraw = -Infinity;
    let blinkT: number | undefined;
    let openT: number | undefined;
    let burstT: number | undefined;
    let hiddenT: number | undefined;
    let sleepyT: number | undefined;
    let paused = false;
    let disposed = false;
    const canvas = document.createElement("canvas");
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = canvas.height = Math.round(64 * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    const link = (): HTMLLinkElement => {
      let el = document.getElementById(LINK_ID) as HTMLLinkElement | null;
      if (!el) {
        document.querySelectorAll('link[rel~="icon"]').forEach((n) => n.parentNode?.removeChild(n));
        el = document.createElement("link");
        el.id = LINK_ID;
        el.rel = "icon";
        el.type = "image/png";
        el.setAttribute("sizes", "64x64");
        document.head.appendChild(el);
      }
      return el;
    };
    const paint = (f: FaviconFrame, force = false) => {
      const now = performance.now();
      if (!force && tooSoon(now, lastDraw)) return;
      lastDraw = now;
      try {
        drawSprout(ctx, canvas.width, f);
        link().href = canvas.toDataURL("image/png");
      } catch {
        /* canvas or link blocked: keep the static icon files */
      }
    };
    const still = (blink = false) => paint(staticFrame(mood, blink), true);

    const scheduleBlink = () => {
      window.clearTimeout(blinkT);
      if (paused || mood === "sleepy" || mq?.matches) return;
      blinkT = window.setTimeout(() => {
        still(true);
        openT = window.setTimeout(() => !disposed && still(), 160);
        scheduleBlink();
      }, nextBlinkDelay());
    };
    const playBurst = (kind: FaviconEvent) => {
      if (paused || mq?.matches) return;
      window.clearInterval(burstT);
      let tick = 0;
      const step = () => {
        const f = burstFrame(mood, kind, tick++);
        if (!f) { window.clearInterval(burstT); burstT = undefined; still(); return; }
        paint(f);
      };
      step();
      burstT = window.setInterval(step, Math.round(1000 / BURST_FPS));
    };
    const armSleepy = () => {
      window.clearTimeout(sleepyT);
      sleepyT = window.setTimeout(() => playBurst("sleepy"), IDLE_SLEEPY_MS);
    };

    const onEvent = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind;
      if (isFaviconEvent(kind)) { playBurst(kind); armSleepy(); }
    };
    const onVisibility = () => {
      window.clearTimeout(hiddenT);
      if (document.hidden) {
        hiddenT = window.setTimeout(() => {
          paused = true;
          window.clearInterval(burstT); window.clearTimeout(blinkT); window.clearTimeout(sleepyT);
        }, HIDDEN_PAUSE_MS);
      } else if (paused) {
        paused = false; still(); scheduleBlink(); armSleepy();
      }
    };
    const onMotion = () => { window.clearInterval(burstT); still(); scheduleBlink(); };

    still();
    scheduleBlink();
    armSleepy();
    window.addEventListener(FAVICON_EVENT_NAME, onEvent);
    document.addEventListener("visibilitychange", onVisibility);
    mq?.addEventListener?.("change", onMotion);

    if (fetchMood) {
      fetch("/api/pet")
        .then((r) => r.json())
        .then((j) => {
          const m = j?.ok ? j.data?.mood : null;
          if (!disposed && MOODS.includes(m) && m !== mood) { mood = m; still(); scheduleBlink(); }
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      window.clearTimeout(blinkT); window.clearTimeout(openT); window.clearInterval(burstT);
      window.clearTimeout(hiddenT); window.clearTimeout(sleepyT);
      window.removeEventListener(FAVICON_EVENT_NAME, onEvent);
      document.removeEventListener("visibilitychange", onVisibility);
      mq?.removeEventListener?.("change", onMotion);
    };
  }, [fetchMood]);
  return null;
}
