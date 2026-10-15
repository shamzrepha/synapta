"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_PREFS, PREFS_KEY, parsePrefs, shouldAutoplay, type Prefs } from "@/lib/settings/prefs";

const EVENT = "sunroot:prefs";
let cacheRaw: string | null | undefined;
let cacheVal: Prefs = DEFAULT_PREFS;

function readRaw(): string | null {
  try {
    return localStorage.getItem(PREFS_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): Prefs {
  const raw = readRaw();
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheVal = parsePrefs(raw);
  }
  return cacheVal;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb); // other tabs
  window.addEventListener(EVENT, cb); // this tab
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** Writes prefs to localStorage and notifies every hook in this and other tabs. */
export function writePrefs(next: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: preference lasts only until reload */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Current preferences (SSR-safe: defaults on the server), kept in sync across tabs. */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFS);
  const update = useCallback((patch: Partial<Prefs>) => {
    const next = { ...getSnapshot(), ...patch };
    writePrefs(next);
    fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
  }, []);
  return [prefs, update];
}

export function useDataSaver(): boolean {
  return useSyncExternalStore(subscribe, () => getSnapshot().dataSaver, () => false);
}

/** False when the student asked for no autoplay or data saver is on. */
export function useAutoplayAllowed(): boolean {
  return useSyncExternalStore(subscribe, () => shouldAutoplay(getSnapshot()), () => false);
}

/** Non-hook read for use inside effects and handlers. */
export function readPrefs(): Prefs {
  return getSnapshot();
}
