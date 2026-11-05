/**
 * Works out what a person is using to reach Sunroot, so the admin can see which platform most learners are on.
 * Pure function (no browser globals) so it is easy to test. No personal data is read: only the user-agent string,
 * whether this is the Android app, and coarse screen/touch hints.
 */
export type DevicePlatform = "android" | "ios" | "windows" | "mac" | "linux" | "chromeos" | "other";
export type DeviceFormFactor = "phone" | "tablet" | "desktop";
export type DeviceMode = "android-app" | "installed-web-app" | "browser";

export interface DeviceInfo {
  platform: DevicePlatform;
  formFactor: DeviceFormFactor;
  mode: DeviceMode;
  browser: string;
}

export interface DeviceHints {
  isNativeApp?: boolean;
  standalone?: boolean;
  maxTouchPoints?: number;
  screenWidth?: number;
}

export function classifyDevice(userAgent: string, hints: DeviceHints = {}): DeviceInfo {
  const ua = userAgent || "";
  const touch = (hints.maxTouchPoints ?? 0) > 1;
  const width = hints.screenWidth ?? 0;

  let platform: DevicePlatform = "other";
  if (/Android/i.test(ua)) platform = "android";
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = "ios";
  else if (/CrOS/i.test(ua)) platform = "chromeos";
  else if (/Windows/i.test(ua)) platform = "windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) platform = touch ? "ios" : "mac"; // iPadOS reports as a Mac but has touch
  else if (/Linux|X11/i.test(ua)) platform = "linux";

  let formFactor: DeviceFormFactor = "desktop";
  if (/iPad/i.test(ua) || (platform === "ios" && !/iPhone|iPod/i.test(ua))) formFactor = "tablet";
  else if (/iPhone|iPod/i.test(ua)) formFactor = "phone";
  else if (platform === "android") formFactor = /Mobile/i.test(ua) || (width > 0 && width < 600) ? "phone" : "tablet";

  let browser = "Other";
  if (/EdgA?\/|Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/.test(ua)) browser = "Firefox";
  else if (/CriOS|Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  const mode: DeviceMode = hints.isNativeApp ? "android-app" : hints.standalone ? "installed-web-app" : "browser";
  return { platform, formFactor, mode, browser };
}
