import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { trackProgress } from "@/lib/game/progress";
import { notify } from "@/lib/notifications/server";
import { writeAudit } from "@/lib/security/audit";
import { giftedExpiryMs, rewardLabel, validReward } from "@/lib/feedback/rewards";

export const runtime = "nodejs";

const body = z.object({ kind: z.enum(["xp", "plan_days"]), amount: z.number().int() });

/** Thank someone for an idea or a bug: XP, or days of the Student plan. A message can be rewarded once. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const { id } = await params;
    const b = await parseJson(req, body);
    if (!validReward(b.kind, b.amount)) throw new ApiError(400, "VALIDATION", "Pick one of the listed amounts.");
    const ref = adminDb().collection("feedback").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Message not found");
    const x = snap.data()!;
    if (x.reward) throw new ApiError(409, "ALREADY_REWARDED", "This message has already been rewarded.");
    const uid = String(x.uid);
    // claim it first so two clicks cannot pay twice
    await ref.update({ reward: { kind: b.kind, amount: b.amount, at: Timestamp.now(), by: admin.uid } });
    if (b.kind === "xp") {
      await trackProgress({ uid, xpToAward: b.amount, reason: "feedback_reward" });
    } else {
      const userRef = adminDb().collection("users").doc(uid);
      const u = (await userRef.get()).data() || {};
      const cur = u.planExpiresAt && typeof u.planExpiresAt.toMillis === "function" ? u.planExpiresAt.toMillis() : Number(u.planExpiresAt) || 0;
      const keepPlan = typeof u.plan === "string" && u.plan !== "free" && cur > Date.now() ? u.plan : "plus";
      await userRef.set({ plan: keepPlan, planExpiresAt: Timestamp.fromMillis(giftedExpiryMs(cur, b.amount)), updatedAt: Timestamp.now() }, { merge: true });
    }
    await notify(uid, { type: "system", title: "A thank-you from Sunroot", body: `You've been given ${rewardLabel(b.kind, b.amount)} for your feedback. Thank you.`, href: "/feedback" });
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "feedback.reward", targetType: "user", targetId: uid, details: { feedbackId: id, kind: b.kind, amount: b.amount } });
    return NextResponse.json({ ok: true, data: { reward: { kind: b.kind, amount: b.amount } } });
  } catch (error) {
    return handleAuthError(error);
  }
}
