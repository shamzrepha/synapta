import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { aiConfigSchema, PROVIDER_PRESETS, TASKS, TASK_LABELS } from "@/lib/ai/structured/types";
import { getAiConfig, listProviders, providerEncryptionWarning, saveAiConfig } from "@/lib/ai/structured/config";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";

/** The Worlds AI setup: which models exist and which model does which job. Keys are never returned. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const [config, providers] = await Promise.all([getAiConfig(true), listProviders()]);
    return NextResponse.json({
      ok: true,
      data: { config, providers, encryptionWarning: providerEncryptionWarning(), presets: PROVIDER_PRESETS, tasks: TASKS.map((t) => ({ key: t, ...TASK_LABELS[t] })) },
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
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "ai_config.saved", targetType: "config", targetId: "ai", details: { models: Object.keys(config.models).length } });
    return NextResponse.json({ ok: true, data: { config } });
  } catch (error) {
    return handleAuthError(error);
  }
}
