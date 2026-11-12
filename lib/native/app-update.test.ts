import { describe, it, expect } from "vitest";
import { parseLatest, needsUpdate, installedBuild, updateKind, shouldRecheck, buildManifest, nativeUpdater } from "./app-update";

const ok = { versionCode: 5, versionName: "2.3", url: "https://sunrootlearn.vercel.app/sunroot-2.5.apk" };
const base = { ...ok, minVersionCode: 0, notes: "" };

describe("app update check", () => {
  it("reads the version file", () => {
    expect(parseLatest(ok)).toEqual(base);
  });
  it("refuses a download link that is not our own APK", () => {
    expect(parseLatest({ ...ok, url: "https://evil.example/sunroot.apk" })).toBeNull();
    expect(parseLatest({ ...ok, url: "https://sunrootlearn.vercel.app/x.html" })).toBeNull();
    expect(parseLatest({ ...ok, url: "http://sunrootlearn.vercel.app/a.apk" })).toBeNull();
    expect(parseLatest({ versionCode: "5", url: ok.url })).toBeNull();
    expect(parseLatest(null)).toBeNull();
    const release = { ...ok, url: "https://github.com/shamzrepha/synapta/releases/download/v2.5/sunroot-2.5.apk" };
    expect(parseLatest(release)).toEqual({ ...release, minVersionCode: 0, notes: "" });
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

describe("required updates, notes and re-checks", () => {
  it("reads the notes and the required-update floor, cleaning the text", () => {
    const l = parseLatest({ ...ok, minVersionCode: 4, notes: "  Faster\n<b>lessons</b>  and fixes " });
    expect(l?.minVersionCode).toBe(4);
    expect(l?.notes).toBe("Faster b lessons /b and fixes");
    expect(parseLatest({ ...ok, notes: "x".repeat(500) })?.notes.length).toBe(160);
    // a floor above the release itself is capped, so nobody is told to install something that does not exist
    expect(parseLatest({ ...ok, minVersionCode: 99 })?.minVersionCode).toBe(5);
  });
  it("says whether an update is optional or required", () => {
    const l = parseLatest({ ...ok, minVersionCode: 4 });
    expect(updateKind(3, l)).toBe("required");
    expect(updateKind(4, l)).toBe("optional");
    expect(updateKind(5, l)).toBe("none");
    expect(updateKind(null, l)).toBe("none");
    expect(updateKind(3, parseLatest(ok))).toBe("optional");
  });
  it("re-checks every six hours, and when the clock jumped back", () => {
    const H = 60 * 60 * 1000;
    expect(shouldRecheck(null, 1000)).toBe(true);
    expect(shouldRecheck(0, 5 * H)).toBe(false);
    expect(shouldRecheck(0, 6 * H)).toBe(true);
    expect(shouldRecheck(10_000, 5_000)).toBe(true);
    expect(shouldRecheck(Number.NaN, 5)).toBe(true);
  });
  it("finds the native updater only inside the app", () => {
    const fn = () => Promise.resolve({});
    expect(nativeUpdater({})).toBeNull();
    expect(nativeUpdater({ Capacitor: { isNativePlatform: () => false, Plugins: { SunrootUpdater: { downloadAndInstall: fn } } } })).toBeNull();
    expect(nativeUpdater({ Capacitor: { isNativePlatform: () => true, Plugins: {} } })).toBeNull();
    expect(nativeUpdater({ Capacitor: { isNativePlatform: () => true, Plugins: { SunrootUpdater: { downloadAndInstall: fn } } } })).not.toBeNull();
  });
});

describe("buildManifest (the release script)", () => {
  const next = { versionCode: 9, versionName: "2.7", url: "https://sunrootlearn.vercel.app/sunroot-2.7.apk" };
  it("builds a valid manifest", () => {
    expect(buildManifest({ ...next, notes: "New focus sprints", minVersionCode: 8 }, { versionCode: 8 })).toEqual({ ...next, notes: "New focus sprints", minVersionCode: 8 });
    expect(buildManifest(next, { versionCode: 8 })).toEqual(next);
  });
  it("refuses a version that does not go up, so phones never miss an update", () => {
    expect(() => buildManifest(next, { versionCode: 9 })).toThrow(/higher/);
    expect(() => buildManifest({ ...next, versionCode: 3 }, { versionCode: 8 })).toThrow(/higher/);
  });
  it("refuses links that are not ours, bad names and an impossible floor", () => {
    expect(() => buildManifest({ ...next, url: "https://evil.example/a.apk" }, null)).toThrow(/url/);
    expect(() => buildManifest({ ...next, versionName: "<script>" }, null)).toThrow(/versionName/);
    expect(() => buildManifest({ ...next, minVersionCode: 10 }, null)).toThrow(/minVersionCode/);
    expect(() => buildManifest({ ...next, versionCode: 0 }, null)).toThrow(/versionCode/);
  });
  it("what it builds is accepted by the app's own reader", () => {
    const m = buildManifest({ ...next, minVersionCode: 8, notes: "ok" }, { versionCode: 8 });
    expect(parseLatest(m)).toMatchObject({ versionCode: 9, minVersionCode: 8, notes: "ok" });
  });
});
