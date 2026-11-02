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
    // keepalive: a language switch reloads the page right after, and the save must still reach the server
    fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next), keepalive: true }).catch(() => null);
  }, []);
  return [prefs, update];
}

/**
 * On sign-in, the account's saved preferences win over this device's, so a learner who chose Igbo on their phone
 * gets Igbo on a new laptop too. If the account has nothing saved yet, this device's choice is saved to it. Runs once
 * per tab per account; reloads the page when the language changed so everything is fetched in it.
 */
export async function adoptAccountPrefs(uid: string): Promise<void> {
  const flag = `sunroot.prefsSynced.${uid}`;
  try {
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, "1");
  } catch {
    /* storage blocked: still sync */
  }
  const res = await fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  if (!res?.ok) return;
  const local = getSnapshot();
  const saved = res.data?.prefs ? parsePrefs(res.data.prefs) : null;
  if (!saved) {
    if (readRaw() !== null) {
      fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(local) }).catch(() => null);
    }
    return;
  }
  if (JSON.stringify(saved) === JSON.stringify(local)) return;
  writePrefs(saved);
  if (saved.language !== local.language) window.location.reload();
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
