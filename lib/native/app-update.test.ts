import { describe, it, expect } from "vitest";
import { parseLatest, needsUpdate, installedBuild } from "./app-update";

const ok = { versionCode: 5, versionName: "2.3", url: "https://sunrootlearn.vercel.app/sunroot-2.3.apk" };

describe("app update check", () => {
  it("reads the version file", () => {
    expect(parseLatest(ok)).toEqual(ok);
  });
  it("refuses a download link that is not our own APK", () => {
    expect(parseLatest({ ...ok, url: "https://evil.example/sunroot.apk" })).toBeNull();
    expect(parseLatest({ ...ok, url: "https://sunrootlearn.vercel.app/x.html" })).toBeNull();
    expect(parseLatest({ ...ok, url: "http://sunrootlearn.vercel.app/a.apk" })).toBeNull();
    expect(parseLatest({ versionCode: "5", url: ok.url })).toBeNull();
    expect(parseLatest(null)).toBeNull();
    const release = { ...ok, url: "https://github.com/shamzrepha/synapta/releases/download/v2.4/sunroot-2.4.apk" };
    expect(parseLatest(release)).toEqual(release);
    expect(parseLatest({ ...ok, url: "https://github.com/someone-else/x/releases/download/v1/a.apk" })).toBeNull();
  });
  it("offers an update only to the app, and only when the installed build is older", () => {
    const latest = parseLatest(ok);
    expect(needsUpdate(4, latest)).toBe(true);
    expect(needsUpdate(5, latest)).toBe(false);
    expect(needsUpdate(6, latest)).toBe(false);
    expect(needsUpdate(null, latest)).toBe(false);
    expect(needsUpdate(4, null)).toBe(false);
  });
  it("is not the app in a normal browser, and never throws", async () => {
    expect(await installedBuild({})).toBeNull();
    expect(await installedBuild(undefined)).toBeNull();
    const broken = { Capacitor: { isNativePlatform: () => true, Plugins: { App: { getInfo: () => Promise.reject(new Error("x")) } } } };
    expect(await installedBuild(broken)).toBeNull();
    const fine = { Capacitor: { isNativePlatform: () => true, Plugins: { App: { getInfo: () => Promise.resolve({ build: "4" }) } } } };
    expect(await installedBuild(fine)).toBe(4);
  });
});
