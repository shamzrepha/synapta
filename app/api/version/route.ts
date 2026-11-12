import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The id of the deployment that is live right now. Open pages and the Android shell compare it with their own to offer a refresh. */
export async function GET() {
  return NextResponse.json(
    { ok: true, data: { build: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || "dev" } },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
