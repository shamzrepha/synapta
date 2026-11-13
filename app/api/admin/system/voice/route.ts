import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { OR_TTS_CHOICES } from "@/lib/ai/openrouter-models";
import { getVoicePref, normaliseVoicePref, setCachedVoicePref } from "@/lib/ai/voice-config";

export const runtime = "nodejs";

/** Which voice speaks podcasts and the tutor, and the choices with their prices. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    return NextResponse.json({ ok: true, data: { pref: await getVoicePref(true), choices: OR_TTS_CHOICES } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const body = z.object({
  engine: z.enum(["openrouter-first", "edge-first"]),
  model: z.string().trim().max(120),
  female: z.string().trim().max(60).optional(),
  male: z.string().trim().max(60).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const b = await parseJson(req, body);
    const choice = OR_TTS_CHOICES.find((c) => c.model === b.model) ?? OR_TTS_CHOICES[0];
    // a changed model brings its own voices unless the admin typed some
    const pref = normaliseVoicePref({ engine: b.engine, model: choice.model, female: b.female || choice.female, male: b.male || choice.male });
    await adminDb().collection("systemConfig").doc("voice").set({ ...pref, updatedBy: admin.email || admin.uid, updatedAt: Timestamp.now() });
    setCachedVoicePref(pref);
    return NextResponse.json({ ok: true, data: { pref } });
  } catch (error) {
    return handleAuthError(error);
  }
}
