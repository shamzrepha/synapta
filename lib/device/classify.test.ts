import { describe, expect, it } from "vitest";
import { classifyDevice } from "./classify";

const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0";

describe("classifyDevice", () => {
  it("android phone in the app", () => {
    expect(classifyDevice(ANDROID_PHONE, { isNativeApp: true })).toEqual({ platform: "android", formFactor: "phone", mode: "android-app", browser: "Chrome" });
  });
  it("android tablet", () => {
    expect(classifyDevice(ANDROID_TABLET).formFactor).toBe("tablet");
  });
  it("iphone in browser", () => {
    expect(classifyDevice(IPHONE)).toMatchObject({ platform: "ios", formFactor: "phone", mode: "browser", browser: "Safari" });
  });
  it("ipad that reports as a mac", () => {
    expect(classifyDevice(IPAD_AS_MAC, { maxTouchPoints: 5 })).toMatchObject({ platform: "ios", formFactor: "tablet" });
  });
  it("real mac and windows are desktop", () => {
    expect(classifyDevice(IPAD_AS_MAC, { maxTouchPoints: 0 })).toMatchObject({ platform: "mac", formFactor: "desktop" });
    expect(classifyDevice(WINDOWS)).toMatchObject({ platform: "windows", formFactor: "desktop", browser: "Edge" });
  });
  it("installed web app", () => {
    expect(classifyDevice(WINDOWS, { standalone: true }).mode).toBe("installed-web-app");
  });
});
