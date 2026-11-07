import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { cleanApiKey } from "@/lib/ai/api-key";
import { clearGroqKey, groqKeyInfo, looksLikeGroqKey, saveGroqKey, testGroqKey } from "@/lib/ai/groq";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Retrieves metadata for the configured Groq API key. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    return NextResponse.json({ ok: true, data: await groqKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Tests and saves a new Groq API key. */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, {
      uid: admin.uid,
      keyPrefix: "admin_groq_key",
      limit: 10,
      windowMs: 10 * 60_000,
      shared: true,
    });
    if (limited) return limited;

    const { key: rawKey } = await parseJson(req, z.object({ key: z.string().trim().min(10).max(250) }));
    const key = cleanApiKey(rawKey);

    if (!looksLikeGroqKey(key)) {
      throw new ApiError(
        400,
        "VALIDATION",
        "That doesn't look like a valid Groq API key. Groq keys start with 'gsk_' (copy it from console.groq.com/keys)."
      );
    }

    const testError = await testGroqKey(key);
    if (testError) {
      throw new ApiError(400, "KEY_TEST_FAILED", testError);
    }

    await saveGroqKey(key, admin);
    return NextResponse.json({ ok: true, data: await groqKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Deletes the admin Groq API key (reverting to environment variable if present). */
export async function DELETE(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    await clearGroqKey();
    return NextResponse.json({ ok: true, data: await groqKeyInfo() });
  } catch (error) {
    return handleAuthError(error);
  }
}
