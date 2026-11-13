import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { aiProviderInfo, setAiProvider, type AiProvider } from "@/lib/ai/groq";

export const runtime = "nodejs";

const providerSchema = z.object({
  provider: z.enum(["gemini", "groq", "openrouter"]),
});

/** Returns the active AI provider and key configuration statuses. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const info = await aiProviderInfo();
    return NextResponse.json({ ok: true, data: info });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Toggles the active AI engine between "gemini", "groq" and "openrouter". */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const { provider } = await parseJson(req, providerSchema);
    await setAiProvider(provider as AiProvider, admin);
    const info = await aiProviderInfo();
    return NextResponse.json({ ok: true, data: info });
  } catch (error) {
    return handleAuthError(error);
  }
}
