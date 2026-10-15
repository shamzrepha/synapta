import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { sendMessage, attachmentSchema } from "@/lib/chat/store";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  text: z.string().trim().max(4000).default(""),
  attachment: attachmentSchema.optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "chat_send", limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    if (!body.text && !body.attachment) throw new ApiError(400, "VALIDATION", "Message is empty.");
    const r = await sendMessage({ chatId, uid: caller.uid, text: body.text ?? "", attachment: body.attachment || null });
    return NextResponse.json({ ok: true, data: r });
  } catch (error) {
    return handleAuthError(error);
  }
}
