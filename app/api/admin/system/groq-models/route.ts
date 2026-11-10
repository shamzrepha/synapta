import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ALL_AI_TASK_KEYS } from "@/lib/ai/tasks";
import { isHeavyTask } from "@/lib/ai/models";
import { activeGroqKey, refreshGroqKey, listGroqModels, mapToGroqModel } from "@/lib/ai/groq";
import { getGroqAssignments, setCachedGroqAssignments } from "@/lib/ai/groq-assign";

export const runtime = "nodejs";

const bodySchema = z.object({ assignments: z.record(z.string(), z.string().max(120)) });

function groupOf(id: string): string {
  if (/whisper|distil-whisper/i.test(id)) return "Speech";
  if (/vision|scout|maverick|llava/i.test(id)) return "Vision";
  if (/guard|safeguard/i.test(id)) return "Safety";
  if (/qwen|deepseek|reason|gpt-oss|r1|qwq/i.test(id)) return "Reasoning";
  if (/70b|120b|405b|versatile|maverick|kimi/i.test(id)) return "Heavy (best quality)";
  if (/8b|instant|gemma|mini|small/i.test(id)) return "Fast (light work)";
  return "Other";
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    await refreshGroqKey();
    const key = activeGroqKey();
    const [assignments, live] = await Promise.all([getGroqAssignments(true), key ? listGroqModels(key) : Promise.resolve(null)]);
    const models = (live ?? []).filter((m) => !/whisper|guard|tts|playai/i.test(m)).sort();
    const defaults: Record<string, string> = {};
    for (const t of ALL_AI_TASK_KEYS) defaults[t] = mapToGroqModel(undefined, isHeavyTask(t));
    return NextResponse.json({
      ok: true,
      data: {
        hasKey: Boolean(key),
        modelsKnown: live !== null,
        models: models.map((id) => ({ id, group: groupOf(id) })),
        assignments,
        defaults,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["admin"]);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError(400, "VALIDATION", "Invalid assignments payload");
    const valid = new Set<string>(ALL_AI_TASK_KEYS);
    const clean: Record<string, string> = {};
    for (const [task, model] of Object.entries(parsed.data.assignments)) {
      if (valid.has(task) && /^[\w.\-/:]+$/.test(model.trim())) clean[task] = model.trim();
    }
    // replace whole doc so "reset to default" (omitted tasks) really clears a pick
    await adminDb().collection("systemConfig").doc("groqModels").set({ ...clean, updatedAt: Timestamp.now(), updatedBy: caller.uid });
    setCachedGroqAssignments(clean);
    return NextResponse.json({ ok: true, data: { assignments: clean } });
  } catch (err) {
    return handleAuthError(err);
  }
}
