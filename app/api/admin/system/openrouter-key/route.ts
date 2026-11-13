import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { cleanApiKey } from "@/lib/ai/api-key";
import { clearOpenRouterKey, looksLikeOpenRouterKey, openRouterKeyInfo, saveOpenRouterKey, testOpenRouterKey } from "@/lib/ai/openrouter";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Metadata for the OpenRouter key (never the key itself). */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    return NextResponse.json({ ok: true, data: await openRouterKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Tests and saves a new OpenRouter key. */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "admin_openrouter_key", limit: 10, windowMs: 10 * 60_000, shared: true });
    if (limited) return limited;
    const { key: rawKey } = await parseJson(req, z.object({ key: z.string().trim().min(10).max(250) }));
    const key = cleanApiKey(rawKey);
    if (!looksLikeOpenRouterKey(key)) throw new ApiError(400, "VALIDATION", "That doesn't look like an OpenRouter key. They start with 'sk-or-' (create one at openrouter.ai/keys).");
    const problem = await testOpenRouterKey(key);
    if (problem) throw new ApiError(400, "KEY_TEST_FAILED", problem);
    await saveOpenRouterKey(key, admin);
    return NextResponse.json({ ok: true, data: await openRouterKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Removes the key set here (the environment variable, if any, is used again). */
export async function DELETE(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    await clearOpenRouterKey();
    return NextResponse.json({ ok: true, data: await openRouterKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}
