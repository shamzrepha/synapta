/**
 * The Android app is a shell around the website, so web fixes reach it the moment they are deployed. Only a change to the shell
 * itself needs a new APK. This compares the installed build with public/app-version.json so the app can offer one-tap update.
 * Android does not let an app install itself silently outside Google Play, so the person still taps "Update" once.
 */
export interface LatestApp {
  versionCode: number;
  versionName: string;
  url: string;
}

export function parseLatest(raw: unknown): LatestApp | null {
  const d = raw as { versionCode?: unknown; versionName?: unknown; url?: unknown } | null;
  if (!d || typeof d.versionCode !== "number" || !Number.isFinite(d.versionCode) || typeof d.url !== "string") return null;
  // only our own site, or our own GitHub releases, may host the download
  if (!/^https:\/\/(sunrootlearn\.vercel\.app\/|github\.com\/shamzrepha\/synapta\/releases\/download\/[A-Za-z0-9._-]+\/)[A-Za-z0-9._-]+\.apk$/.test(d.url)) return null;
  return { versionCode: d.versionCode, versionName: typeof d.versionName === "string" ? d.versionName.slice(0, 20) : String(d.versionCode), url: d.url };
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
