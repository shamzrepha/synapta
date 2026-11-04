/**
 * The website also runs inside the Android app (a Capacitor shell). These helpers let a page ask "am I in the app, and is a
 * given native plugin installed?" without importing any native package, so the website still builds and works in a browser.
 */
type Win = {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
  navigator?: { userAgent?: string };
};

const w = (): Win | undefined => (typeof window === "undefined" ? undefined : (window as unknown as Win));

export function isNativeApp(win: Win | undefined = w()): boolean {
  try {
    return !!win?.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** A native plugin by its registered name, or null when the app doesn't have it (or this is a normal browser). */
export function nativePlugin<T = Record<string, (...args: never[]) => Promise<unknown>>>(name: string, win: Win | undefined = w()): T | null {
  const p = win?.Capacitor?.Plugins?.[name];
  return p ? (p as T) : null;
}

/** An Android in-app web view (Google refuses to sign people in inside one). */
export function isAndroidWebView(userAgent = w()?.navigator?.userAgent || ""): boolean {
  return /Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent);
}

/** Open a link in the phone's own browser tab (Chrome Custom Tab) when the app has that plugin; otherwise navigate normally. */
export async function openExternal(url: string): Promise<void> {
  const browser = nativePlugin<{ open: (o: { url: string }) => Promise<void> }>("Browser");
  if (isNativeApp() && browser) {
    await browser.open({ url });
    return;
  }
  window.location.assign(url);
}
