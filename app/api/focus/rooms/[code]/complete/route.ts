import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { trackProgress } from "@/lib/game/progress";
import { recordGroupActivity } from "@/lib/groups/activity";
import { canClaimBlock, normalizeCode, xpForBlock } from "@/lib/focus/timer";
import { adminDb } from "@/lib/firebase/admin";
import { dayId } from "@/lib/streaks/days";
import { loadRoom, loadUserSessions, focusStats, roomConfig, roomRef } from "@/lib/focus/server";

export const runtime = "nodejs";

const bodySchema = z.object({ block: z.number().int().min(0).max(10_000) });
const DAILY_XP_BLOCKS = 12;

/** Claim credit for a finished focus block: XP, streak, and group activity. Idempotent per block. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "focus_complete", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const code = normalizeCode((await params).code);
    if (!code) throw new ApiError(400, "VALIDATION", "Bad room code.");
    const { block } = await parseJson(req, bodySchema);
    const room = await loadRoom(code);
    if (room.anchorMs == null) throw new ApiError(409, "NOT_RUNNING", "The timer isn't running.");
    const member = await roomRef(code).collection("members").doc(caller.uid).get();
    if (!member.exists) throw new ApiError(409, "NOT_JOINED", "Join the room first.");
    const cfg = roomConfig(room);
    const now = Date.now();
    const check = canClaimBlock({ anchorMs: room.anchorMs, cfg, block, nowMs: now, joinedAtMs: Number(member.data()!.joinedAtMs || now) });
    if (!check.ok) throw new ApiError(400, "NOT_ELIGIBLE", check.reason || "Can't claim this block.");

    const day = dayId(now);
    const rows = await loadUserSessions(caller.uid);
    const todayCount = rows.filter((r) => r.day === day).length;
    const docId = `${code}_${room.anchorMs}_${block}_${caller.uid}`;
    try {
      await adminDb().collection("focusSessions").doc(docId).create({
        uid: caller.uid,
        code,
        minutes: cfg.focusMin,
        day,
        doing: String(member.data()!.doing || ""),
        completedAtMs: now,
      });
    } catch (e) {
      if ((e as { code?: number }).code === 6) {
        return NextResponse.json({ ok: true, data: { alreadyClaimed: true, xp: 0, streak: focusStats(rows).streak.current } });
      }
      throw e;
    }

    const xp = todayCount < DAILY_XP_BLOCKS ? xpForBlock(cfg.focusMin) : 0;
    if (xp > 0) await trackProgress({ uid: caller.uid, xpToAward: xp, reason: "focus_block" });
    await recordGroupActivity(caller.uid, "focus");
    const stats = focusStats([{ uid: caller.uid, code, minutes: cfg.focusMin, day, doing: "", completedAtMs: now }, ...rows]);
    return NextResponse.json({ ok: true, data: { alreadyClaimed: false, xp, streak: stats.streak.current } });
  } catch (error) {
    return handleAuthError(error);
  }
}
