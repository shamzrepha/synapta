"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { DOWNLOADS_CACHE, ITEMS_KEY, parseItems, removeItem, upsertItem, type OfflineItem } from "@/lib/offline/items";

const EVENT = "sunroot:offline-items";
const EMPTY: OfflineItem[] = [];
let cacheRaw: string | null | undefined;
let cacheVal: OfflineItem[] = EMPTY;

function getSnapshot(): OfflineItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ITEMS_KEY);
  } catch {
    /* blocked */
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheVal = parseItems(raw);
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

function save(items: OfflineItem[]) {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  } catch {
    /* blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useOfflineItems(): OfflineItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function offlineSupported(): boolean {
  return typeof caches !== "undefined";
}

/** Fetches `url` (and the current page shell) into the offline cache. Returns an error message or null. */
export async function downloadForOffline(url: string, title: string, page: string): Promise<string | null> {
  if (!offlineSupported()) return "Offline storage isn't available in this browser.";
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return "Couldn't download this right now.";
    const blob = await res.clone().blob();
    const cache = await caches.open(DOWNLOADS_CACHE);
    await cache.put(url, res);
    try {
      await cache.add(page); // so the page itself opens offline
    } catch {
      /* page shell is best effort */
    }
    save(upsertItem(getSnapshot(), { url, page, title, bytes: blob.size, savedAt: new Date().toISOString() }));
    return null;
  } catch {
    return "Couldn't download this right now.";
  }
}

export async function removeOffline(url: string): Promise<void> {
  try {
    const cache = await caches.open(DOWNLOADS_CACHE);
    await cache.delete(url);
  } catch {
    /* ignore */
  }
  save(removeItem(getSnapshot(), url));
}

export async function clearOffline(): Promise<void> {
  try {
    await caches.delete(DOWNLOADS_CACHE);
  } catch {
    /* ignore */
  }
  save([]);
}

/** `const { downloaded, busy, download, remove } = useOfflineDownload(url, title)` for a download button. */
export function useOfflineDownload(url: string, title = url) {
  const items = useOfflineItems();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloaded = items.some((i) => i.url === url);
  const download = useCallback(async () => {
    setBusy(true);
    setError(null);
    const page = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/offline";
    const err = await downloadForOffline(url, title, page);
    setError(err);
    setBusy(false);
  }, [url, title]);
  const remove = useCallback(() => removeOffline(url), [url]);
  return { downloaded, busy, error, download, remove };
}
