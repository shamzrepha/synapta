import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { PROVIDER_PRESETS } from "@/lib/ai/structured/types";
import { providerKey } from "@/lib/ai/structured/config";
import { guessModel } from "@/lib/ai/structured/categories";

export const runtime = "nodejs";

/** Asks a provider which models its key can use, and sorts them into specialties (suggestions only: the admin confirms). */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const { providerId } = await parseJson(req, z.object({ providerId: z.string().min(2).max(40) }));
    const found = await providerKey(providerId);
    if (!found) throw new ApiError(400, "NO_KEY", "Add a key for this provider first.");
    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    if ((found.meta?.kind ?? preset?.kind) === "gemini") {
      throw new ApiError(400, "MANUAL", "For Gemini, type the model name you want to use (see Google AI Studio for the list).");
    }
    const baseUrl = (found.meta?.baseUrl ?? preset?.baseUrl ?? "").replace(/\/+$/, "");
    if (!baseUrl) throw new ApiError(400, "NO_URL", "This provider has no API address.");
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${found.key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res || !res.ok) throw new ApiError(502, "PROVIDER", "The provider didn't return its model list. Check the key and the address.");
    const json = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
    const ids = (json?.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string" && id.length > 0);
    return NextResponse.json({ ok: true, data: { models: ids.map(guessModel) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
