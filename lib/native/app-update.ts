/**
 * The Android app is a shell around the website, so web fixes reach it the moment they are deployed. Only a change to the shell
 * itself needs a new APK. This compares the installed build with public/app-version.json so the app can offer one-tap update.
 * Android does not let an app install itself silently outside Google Play, so the person still taps "Update" once.
 */
export interface LatestApp {
  versionCode: number;
  versionName: string;
  url: string;
  /** installed builds below this must update (a breaking change on the server, a security fix); 0 means the update is optional */
  minVersionCode: number;
  /** one short plain-language line about what is new */
  notes: string;
}

const URL_OK = /^https:\/\/(sunrootlearn\.vercel\.app\/|github\.com\/shamzrepha\/synapta\/releases\/download\/[A-Za-z0-9._-]+\/)[A-Za-z0-9._-]+\.apk$/;
const cleanLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseLatest(raw: unknown): LatestApp | null {
  const d = raw as { versionCode?: unknown; versionName?: unknown; url?: unknown; minVersionCode?: unknown; notes?: unknown } | null;
  if (!d || typeof d.versionCode !== "number" || !Number.isFinite(d.versionCode) || typeof d.url !== "string") return null;
  // only our own site, or our own GitHub releases, may host the download
  if (!URL_OK.test(d.url)) return null;
  const min = typeof d.minVersionCode === "number" && Number.isFinite(d.minVersionCode) && d.minVersionCode > 0 ? Math.min(d.minVersionCode, d.versionCode) : 0;
  return {
    versionCode: d.versionCode,
    versionName: typeof d.versionName === "string" ? d.versionName.slice(0, 20) : String(d.versionCode),
    url: d.url,
    minVersionCode: min,
    notes: cleanLine(d.notes, 160),
  };
}

export type UpdateKind = "none" | "optional" | "required";

/** Whether an installed build should update, and whether it may say "later". */
export function updateKind(installed: number | null, latest: LatestApp | null): UpdateKind {
  if (installed === null || latest === null || latest.versionCode <= installed) return "none";
  return latest.minVersionCode > 0 && installed < latest.minVersionCode ? "required" : "optional";
}

/** Check again when the last check is older than this (the app is often left open for days). */
export const RECHECK_MS = 6 * 60 * 60 * 1000;
export function shouldRecheck(lastCheckedAt: number | null, now: number, everyMs = RECHECK_MS): boolean {
  return lastCheckedAt === null || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= everyMs || now < lastCheckedAt;
}

/**
 * Builds the next public/app-version.json for a release, refusing mistakes that would strand phones: a download link that is not
 * ours, a version that does not go up (the banner would never show), or a required-update floor above the release itself.
 */
export function buildManifest(
  next: { versionCode: number; versionName: string; url: string; minVersionCode?: number; notes?: string },
  previous?: { versionCode?: number } | null,
): { versionCode: number; versionName: string; url: string; minVersionCode?: number; notes?: string } {
  if (!Number.isInteger(next.versionCode) || next.versionCode < 1) throw new Error("versionCode must be a whole number of 1 or more");
  if (previous && typeof previous.versionCode === "number" && next.versionCode <= previous.versionCode) {
    throw new Error(`versionCode ${next.versionCode} must be higher than the current ${previous.versionCode}, or no phone will see the update`);
  }
  if (!/^[0-9][0-9A-Za-z.\-]{0,19}$/.test(next.versionName)) throw new Error("versionName looks like 2.7 or 2.7.1");
  if (!URL_OK.test(next.url)) throw new Error("url must be an .apk on sunrootlearn.vercel.app or on this project's GitHub release downloads");
  const out: { versionCode: number; versionName: string; url: string; minVersionCode?: number; notes?: string } = { versionCode: next.versionCode, versionName: next.versionName, url: next.url };
  if (next.minVersionCode !== undefined && next.minVersionCode > 0) {
    if (!Number.isInteger(next.minVersionCode) || next.minVersionCode > next.versionCode) throw new Error("minVersionCode cannot be higher than versionCode");
    out.minVersionCode = next.minVersionCode;
  }
  const notes = cleanLine(next.notes, 160);
  if (notes) out.notes = notes;
  return out;
}

/** The optional native updater (a small Capacitor plugin in the Android project): downloads with progress and opens the installer. */
export interface NativeUpdater {
  downloadAndInstall: (opts: { url: string; versionCode: number }) => Promise<{ started?: boolean; needsPermission?: boolean }>;
  addListener?: (event: "progress", cb: (e: { percent?: number; received?: number; total?: number; done?: boolean; error?: string }) => void) => Promise<{ remove: () => void }> | { remove: () => void };
}

export function nativeUpdater(win: unknown = typeof window === "undefined" ? undefined : window): NativeUpdater | null {
  const cap = (win as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } } | undefined)?.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const p = cap.Plugins?.SunrootUpdater as NativeUpdater | undefined;
  return p && typeof p.downloadAndInstall === "function" ? p : null;
}

/** The installed build number, or null when this is not the app (or the shell can't tell us). */
export async function installedBuild(win: unknown = typeof window === "undefined" ? undefined : window): Promise<number | null> {
  try {
    const cap = (win as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, { getInfo?: () => Promise<{ build?: string | number }> }> } } | undefined)?.Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    const info = await cap.Plugins?.App?.getInfo?.();
    const n = Number(info?.build);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function needsUpdate(installed: number | null, latest: LatestApp | null): boolean {
  return installed !== null && latest !== null && latest.versionCode > installed;
}
