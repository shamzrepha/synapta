"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  window.addEventListener("resize", cb);
  return () => {
    m.removeEventListener("change", cb);
    window.removeEventListener("resize", cb);
  };
};
// a touch screen: the browser says the main pointer is a finger, or it has touch points and the window is phone/tablet sized
const snapshot = () => window.matchMedia(QUERY).matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 820);

/** True on touch screens (a finger, not a mouse). Used so interactive stages don't swallow the page's scrolling. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
