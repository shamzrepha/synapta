"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ACCESSIBILITY_KEY,
  DEFAULT_ACCESSIBILITY,
  parseAccessibility,
  type AccessibilityPrefs,
} from "@/lib/settings/accessibility";
import { readPrefs } from "./use-prefs";

const EVENT = "sunroot:a11y";
let cacheRaw: string | null | undefined;
let cacheVal: AccessibilityPrefs = DEFAULT_ACCESSIBILITY;

function readRaw(): string | null {
  try {
    return localStorage.getItem(ACCESSIBILITY_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): AccessibilityPrefs {
  const raw = readRaw();
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheVal = parseAccessibility(raw);
  }
  return cacheVal;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** Writes accessibility preferences to localStorage and notifies hooks across tabs. */
export function writeAccessibility(next: AccessibilityPrefs) {
  try {
    localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Reactive reading & learning accessibility settings persisted locally and synced to Firestore. */
export function useAccessibility(): [AccessibilityPrefs, (patch: Partial<AccessibilityPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_ACCESSIBILITY);
  const update = useCallback((patch: Partial<AccessibilityPrefs>) => {
    const next = { ...getSnapshot(), ...patch };
    writeAccessibility(next);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...readPrefs(), accessibility: next }),
      keepalive: true,
    }).catch(() => null);
  }, []);
  return [prefs, update];
}

export function readAccessibility(): AccessibilityPrefs {
  return getSnapshot();
}
