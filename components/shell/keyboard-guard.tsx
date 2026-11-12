"use client";

import { useEffect } from "react";

const TEXT_FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]), textarea, [contenteditable=true], [contenteditable='']";

/**
 * Keeps typing comfortable on phones. When the keyboard opens it:
 *  - marks the page (html[data-keyboard="open"]) so fixed bars such as the bottom menu get out of the way,
 *  - exposes the visible height as --vvh,
 *  - scrolls the field you tapped into the middle of what is still visible, so you can always see what you type.
 * It does nothing on desktop.
 */
export function KeyboardGuard() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The tallest the window has been while nobody was typing. Some Android WebViews shrink the whole window
    // (so innerHeight and visualViewport shrink together); comparing with this catches that case too.
    let calm = window.innerHeight;
    const typingNow = () => !!document.activeElement?.matches?.(TEXT_FIELD);

    const reveal = (el: Element | null) => {
      if (!el || !(el as HTMLElement).matches?.(TEXT_FIELD)) return;
      clearTimeout(timer);
      // wait for the keyboard animation, then bring the field into view
      timer = setTimeout(() => {
        try {
          (el as HTMLElement).scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        } catch {
          /* old browsers: leave it where it is */
        }
      }, 320);
    };

    const measure = () => {
      const h = vv?.height ?? window.innerHeight;
      root.style.setProperty("--vvh", `${Math.round(h)}px`);
      if (!typingNow() && window.innerHeight > calm - 120) calm = Math.max(calm, window.innerHeight);
      // the visible area shrinks by well over 120px when a keyboard opens (either the visual viewport or the window itself)
      const open = window.innerHeight - h > 120 || (typingNow() && calm - Math.min(h, window.innerHeight) > 120);
      if (open) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
      if (open) reveal(document.activeElement);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null;
      // a PC has no on-screen keyboard, so Sprout and the buttons stay; phones and tablets (touch) get out of the way
      const touch = window.matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
      if (t?.matches?.(TEXT_FIELD) && touch) {
        root.dataset.typing = "true";
        reveal(t);
      }
    };
    const onFocusOut = () => {
      // keep the flag only if another field takes the focus straight away
      setTimeout(() => {
        if (!document.activeElement?.matches?.(TEXT_FIELD)) delete root.dataset.typing;
      }, 80);
    };

    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("orientationchange", () => {
      calm = window.innerHeight;
      measure();
    });
    window.addEventListener("resize", measure);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return null;
}
