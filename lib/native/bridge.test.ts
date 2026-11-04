import { describe, it, expect } from "vitest";
import { isNativeApp, nativePlugin, isAndroidWebView } from "./bridge";

describe("native bridge", () => {
  it("is not the app in a normal browser", () => {
    expect(isNativeApp(undefined)).toBe(false);
    expect(isNativeApp({})).toBe(false);
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
  });
  it("is the app when Capacitor says so, and finds installed plugins only", () => {
    const win = { Capacitor: { isNativePlatform: () => true, Plugins: { Browser: { open: () => Promise.resolve() } } } };
    expect(isNativeApp(win)).toBe(true);
    expect(nativePlugin("Browser", win)).not.toBeNull();
    expect(nativePlugin("FirebaseAuthentication", win)).toBeNull();
  });
  it("never throws if the bridge is broken", () => {
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => { throw new Error("x"); } } })).toBe(false);
  });
  it("recognises an Android web view but not Chrome", () => {
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36")).toBe(true);
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36")).toBe(false);
  });
});
