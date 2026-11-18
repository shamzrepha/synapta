import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseLatest } from "./app-update";

const publicDir = path.join(process.cwd(), "public");
const raw = JSON.parse(fs.readFileSync(path.join(publicDir, "app-version.json"), "utf8"));

describe("public/app-version.json", () => {
  it("is accepted by the same parser the app uses", () => {
    expect(parseLatest(raw)).not.toBeNull();
  });
  it("points at an APK that exists when it is hosted on the site itself", () => {
    const url = new URL(raw.url);
    if (url.hostname === "github.com") return; // a GitHub release asset: nothing to check in the repo
    const file = path.join(publicDir, path.basename(url.pathname));
    expect(fs.existsSync(file), `${raw.url} is not in public/`).toBe(true);
  });
  it("has a versionName that matches the APK file name", () => {
    expect(path.basename(new URL(raw.url).pathname)).toContain(`-${raw.versionName}.apk`);
  });
  it("has a whole-number versionCode", () => {
    expect(Number.isInteger(raw.versionCode) && raw.versionCode > 0).toBe(true);
  });
});
