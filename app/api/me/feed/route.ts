import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildMirrorProfile } from "@/lib/mirror/profile";
import { rankCandidates } from "@/lib/mirror/rank";
import { FormatSchema, type Format } from "@/lib/mirror/schema";
import { loadMirror } from "@/lib/mirror/store";
import { sproutStyleFrom } from "@/lib/mirror/sprout-style";
import { candidatesFrom, loadFeedInputs } from "@/lib/mirror/feed";
import { assertPlausibleToday } from "@/lib/exams/server";
import { isDayString } from "@/lib/exams/schedule";

export const runtime = "nodejs";

const ids = z
  .string()
  .max(1500)
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 60));
const query = z.object({
  today: z.string().refine(isDayString, "today must be YYYY-MM-DD"),
  /** items finished today on this device, counted against the daily goal */
  done: z.coerce.number().int().min(0).max(100).default(0),
  /** "keep going" extra items beyond today's goal, in steps of 3 */
  bonus: z.coerce.number().int().min(0).max(12).default(0),
  doneIds: ids.optional(),
  skippedIds: ids.optional(),
  recent: z
    .string()
    .max(100)
    .transform((s) => s.split(",").filter((f): f is Format => FormatSchema.safeParse(f).success))
    .optional(),
});

/** The next few things worth doing, with a reason for each, and a gentle end once today's goal is met. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed-get", limit: 20, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message || "Invalid request");
    const q = parsed.data;
    assertPlausibleToday(q.today);

    const now = Date.now();
    const state = await loadMirror(caller.uid);
    const profile = buildMirrorProfile(state, now);
    const target = state.prefs.dailyGoalItems + q.bonus;
    const remaining = Math.max(0, target - q.done);
    const goal = { target, done: q.done, remaining };
    if (remaining === 0) {
      return NextResponse.json({ ok: true, data: { items: [], goal, finished: "goal_met", personalised: profile.personalised, sprout: sproutStyleFrom(profile) } });
    }

    const inputs = await loadFeedInputs(caller.uid, q.today, now);
    const ranked = rankCandidates(candidatesFrom(inputs), {
      profile,
      seed: `${caller.uid}:${q.today}:${q.done}:${q.bonus}`,
      totalSignals: state.totalSignals,
      limit: Math.min(remaining, 5),
      recentFormats: q.recent,
      skippedIds: q.skippedIds,
      doneIds: q.doneIds,
    });
    const items = ranked.map((r) => ({ id: r.id, kind: r.kind, format: r.format, title: r.title, href: r.href, minutes: r.minutes, why: r.why, reason: r.reason, topicId: r.topicId, topicTitle: r.topicTitle }));
    return NextResponse.json({ ok: true, data: { items, goal, finished: items.length === 0 ? "caught_up" : null, personalised: profile.personalised, sprout: sproutStyleFrom(profile) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
