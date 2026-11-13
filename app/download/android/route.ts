import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parseLatest } from "@/lib/native/app-update";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const file = path.join(process.cwd(), "public", "app-version.json");
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const manifest = parseLatest(raw);
      if (manifest?.url) {
        return NextResponse.redirect(manifest.url, {
          status: 302,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }
    }
  } catch {
    // fallback below
  }

  return NextResponse.redirect("https://sunrootlearn.vercel.app/sunroot-3.0.apk", {
    status: 302,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function HEAD() {
  return GET();
}
