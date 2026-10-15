import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadEvent, statusOf, eventChannels } from "@/lib/events/store";
import { bumpChannels } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(10).max(3000),
  link: z.string().url().max(500),
  repoLink: z.string().url().max(500).optional().nullable(),
});

/** Create or update the caller's hackathon submission while the hackathon is live. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const body = await parseJson(req, schema);
    for (const u of [body.link, body.repoLink].filter(Boolean) as string[]) {
      if (!/^https?:\/\//i.test(u)) throw new ApiError(400, "VALIDATION", "Links must start with http:// or https://");
    }
    const { ref, ev } = await loadEvent(caller, eventId);
    if (ev.kind !== "hackathon") throw new ApiError(400, "BAD_KIND", "Not a hackathon.");
    if (statusOf(ev) !== "live") throw new ApiError(409, "NOT_LIVE", "Submissions are closed.");

    const entryRef = ref.collection("entries").doc(caller.uid);
    await adminDb().runTransaction(async (t) => {
      const e = await t.get(entryRef);
      if (!e.exists) throw new ApiError(409, "NOT_JOINED", "Join the hackathon first.");
      const first = !e.data()!.submittedAt;
      t.update(entryRef, {
        title: body.title,
        summary: body.summary,
        link: body.link,
        repoLink: body.repoLink || null,
        submittedAt: first ? Timestamp.now() : e.data()!.submittedAt,
        updatedAt: Timestamp.now(),
      });
      if (first) t.update(ref, { submissionCount: FieldValue.increment(1) });
    });
    await bumpChannels(eventChannels(eventId, ev));
    return NextResponse.json({ ok: true, data: { submitted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
