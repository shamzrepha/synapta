import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { listProviders, removeProviderKey, saveProviderKey } from "@/lib/ai/structured/config";

export const runtime = "nodejs";

const idSchema = z.string().min(2).max(40).regex(/^[a-z0-9_-]+$/);
const saveSchema = z.object({
  id: idSchema,
  kind: z.enum(["openai_compatible", "gemini"]),
  label: z.string().trim().min(1).max(60),
  baseUrl: z.string().url().max(200).startsWith("https://").optional(),
  key: z.string().trim().min(8).max(400),
});

/** Saves a provider's key on the server. The key is never sent back to any browser. */
export async function PUT(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const body = await parseJson(req, saveSchema);
    if (body.kind === "openai_compatible" && !body.baseUrl) throw new ApiError(400, "VALIDATION", "Add the provider's API address (it ends in /v1).");
    await saveProviderKey(body);
    return NextResponse.json({ ok: true, data: { providers: await listProviders() } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const { id } = await parseJson(req, z.object({ id: idSchema }));
    await removeProviderKey(id);
    return NextResponse.json({ ok: true, data: { providers: await listProviders() } });
  } catch (error) {
    return handleAuthError(error);
  }
}
