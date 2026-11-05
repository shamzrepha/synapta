/**
 * "Failed to load chunk …" means the page asked for a piece of the app that it couldn't get: a weak connection, or a page that
 * was saved before the last update and points at files that have since been replaced. The fix is always the same: forget the
 * saved copies and load the page again. We do it once automatically so people see a brief reload instead of an error screen.
 */
const KEY = "sunroot:chunkRecovery";
const COOLDOWN_MS = 2 * 60 * 1000;

export function isChunkError(e: unknown): boolean {
  const text = e instanceof Error ? `${e.name} ${e.message}` : typeof e === "string" ? e : "";
  return /ChunkLoadError|Failed to load chunk|Loading chunk [^ ]+ failed|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i.test(text);
}

/** Try once, then leave the error screen alone for a couple of minutes so a real, lasting problem can never cause a reload loop. */
export function shouldRecover(lastAttemptAt: number | null, now: number): boolean {
  return lastAttemptAt === null || !Number.isFinite(lastAttemptAt) || now - lastAttemptAt > COOLDOWN_MS;
}

/** Clears the saved app copies and reloads. Returns false when it already tried a moment ago (the caller shows the normal error). */
export async function recoverFromChunkError(now = Date.now()): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let last: number | null = null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    last = raw ? Number(raw) : null;
  } catch {}
  if (!shouldRecover(last, now)) return false;
  try {
    window.sessionStorage.setItem(KEY, String(now));
  } catch {}
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("sunroot-shell-") || n.startsWith("sunroot-static-")).map((n) => caches.delete(n)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      // only the site-wide offline worker; the notifications worker has its own scope and stays
      await Promise.all(regs.filter((r) => r.scope === `${window.location.origin}/`).map((r) => r.unregister()));
    }
  } catch {}
  window.location.reload();
  return true;
}
