import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { aiConfigSchema, PROVIDER_PRESETS, TASKS, TASK_LABELS } from "@/lib/ai/structured/types";
import { getAiConfig, listProviders, saveAiConfig } from "@/lib/ai/structured/config";

export const runtime = "nodejs";

/** The Worlds AI setup: which models exist and which model does which job. Keys are never returned. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const [config, providers] = await Promise.all([getAiConfig(true), listProviders()]);
    return NextResponse.json({
      ok: true,
      data: { config, providers, presets: PROVIDER_PRESETS, tasks: TASKS.map((t) => ({ key: t, ...TASK_LABELS[t] })) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const body = await parseJson(req, aiConfigSchema);
    const config = await saveAiConfig(body, admin);
    return NextResponse.json({ ok: true, data: { config } });
  } catch (error) {
    return handleAuthError(error);
  }
}
