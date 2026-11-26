import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  registerDeviceInFirestore,
  getDeviceSessionsFromFirestore,
} from "@/lib/auth/concurrent-sessions";

export const runtime = "nodejs";

const registerSchema = z.object({
  deviceId: z.string().trim().min(4).max(128),
  userAgent: z.string().max(300).optional(),
  label: z.string().max(80).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const currentDeviceId = searchParams.get("deviceId") || undefined;

    const result = await getDeviceSessionsFromFirestore(caller.uid, currentDeviceId);
    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, {
      uid: caller.uid,
      keyPrefix: "device-register",
      limit: 120,
      windowMs: 60 * 1000,
      shared: true,
    });
    if (limited) return limited;

    const body = await parseJson(req, registerSchema);
    const userAgent = body.userAgent || req.headers.get("user-agent") || "Web Browser";

    const result = await registerDeviceInFirestore(
      caller.uid,
      {
        deviceId: body.deviceId,
        userAgent,
        label: body.label,
      },
      caller.role
    );

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
