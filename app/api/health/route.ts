import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "synapta-platform",
      version: process.env.npm_package_version || "1.0.0",
    },
  });
}
