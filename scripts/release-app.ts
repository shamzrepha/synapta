/**
 * Publishes a new Android app version to the phones: writes public/app-version.json after checking it can't strand anyone.
 *
 *   npm run release:app -- --code 9 --name 2.7 --url https://github.com/shamzrepha/synapta/releases/download/v2.7/sunroot-2.7.apk \
 *     --notes "Focus sprints and faster lessons" [--min 8] [--dry]
 *
 * --min makes every installed build below that number update (a required update). Leave it out for an optional one.
 * Do this only AFTER the APK is uploaded to the release (or to the site) and android/app/build.gradle has the same versionCode.
 */
import fs from "node:fs";
import path from "node:path";
import { buildManifest } from "../lib/native/app-update";

const FILE = path.join(process.cwd(), "public", "app-version.json");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const code = Number(arg("code"));
  const name = arg("name") || "";
  const url = arg("url") || "";
  const min = arg("min") !== undefined ? Number(arg("min")) : undefined;
  const dry = process.argv.includes("--dry");
  let previous: { versionCode?: number } | null = null;
  try {
    previous = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    /* first release */
  }
  const next = buildManifest({ versionCode: code, versionName: name, url, minVersionCode: min, notes: arg("notes") }, previous);
  const json = `${JSON.stringify(next, null, 2)}\n`;
  console.log(`${dry ? "Would write" : "Writing"} ${path.relative(process.cwd(), FILE)}:\n${json}`);
  if (!dry) fs.writeFileSync(FILE, json);
  console.log(
    [
      "Before you merge, check that:",
      `  - android/app/build.gradle has versionCode ${next.versionCode} (the app reads it; the banner compares it with this file)`,
      "  - the APK at that url downloads and installs over the old build (same signing key)",
      next.minVersionCode ? `  - builds below ${next.minVersionCode} will be asked to update and cannot dismiss it` : "  - this is an optional update: people can say Later",
      "Merging to main deploys this file; phones see it within six hours or at their next launch.",
    ].join("\n"),
  );
}

try {
  main();
} catch (e) {
  console.error(`Not released: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
