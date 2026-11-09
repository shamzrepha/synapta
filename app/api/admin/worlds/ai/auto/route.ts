import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { autoSetupFromExistingKeys } from "@/lib/ai/structured/config";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Fills the Worlds AI setup from the keys already saved in the admin console. Never overwrites a job that already has a model. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const r = await autoSetupFromExistingKeys(admin);
    return NextResponse.json({ ok: true, data: r });
  } catch (error) {
    return handleAuthError(error);
  }
}
