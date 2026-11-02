import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { clearGeminiKey, geminiKeyInfo, looksLikeGeminiKey, saveGeminiKey, testGeminiKey } from "@/lib/ai/api-key";
import { clearAllModelExhaustion } from "@/lib/ai/health";
import { resetVoiceBreakers } from "@/lib/ai/voice";
import { resolveModelChain } from "@/lib/ai/router";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Where the Gemini key comes from and its last four characters (admins only; the key itself never leaves the server). */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    return NextResponse.json({ ok: true, data: await geminiKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Tests a new key with a tiny real request, then makes it the key the whole app uses. */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "admin_ai_key", limit: 10, windowMs: 10 * 60_000, shared: true });
    if (limited) return limited;
    const { key } = await parseJson(req, z.object({ key: z.string().trim().min(10).max(200) }));
    if (!looksLikeGeminiKey(key)) {
      throw new ApiError(400, "VALIDATION", "That doesn't look like a Gemini API key. It should start with \"AIza\" and be 39 characters (copy it from aistudio.google.com/apikey).");
    }
    const model = (await resolveModelChain("tutor_chat"))[0];
    const problem = await testGeminiKey(key, model);
    if (problem) throw new ApiError(400, "KEY_TEST_FAILED", problem);
    await saveGeminiKey(key, admin);
    // a fresh key has its own quota: forget the old key's "exhausted" marks and voice cool-downs
    await clearAllModelExhaustion().catch(() => null);
    resetVoiceBreakers();
    return NextResponse.json({ ok: true, data: await geminiKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Goes back to the GEMINI_API_KEY environment variable. */
export async function DELETE(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    await clearGeminiKey();
    await clearAllModelExhaustion().catch(() => null);
    resetVoiceBreakers();
    return NextResponse.json({ ok: true, data: await geminiKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}
