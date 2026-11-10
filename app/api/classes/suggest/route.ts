import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { suggestClass } from "@/lib/teacher/suggest";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z
  .object({ seedText: z.string().max(100000).optional(), idea: z.string().trim().max(600).optional() })
  .refine((b) => (b.seedText?.trim().length ?? 0) > 20 || (b.idea?.length ?? 0) > 2, { message: "Add some notes or a rough idea first." });

/** AI proposes the class name, subject and description from uploaded notes or a rough idea. The teacher can edit all of it. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "class-suggest", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    try {
      return NextResponse.json({ ok: true, data: await suggestClass({ userId: caller.uid, seedText: body.seedText, idea: body.idea }) });
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(502, "AI_FAILED", "The AI couldn't suggest a name this time. You can type one yourself, or try again.");
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
