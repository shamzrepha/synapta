import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireVerifiedEmail, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const claimReferralSchema = z.object({
  referrerUsername: z.string().trim().min(3).max(32),
});

/**
 * Campus Ambassador & Class-Rep Referral Engine:
 * Every coursemate referred earns +250 XP for both students.
 * At 10 referrals, the referrer automatically unlocks a free 14-day Exam Pass.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const d = userDoc.data() || {};
    const referralCount = typeof d.referralCount === "number" ? d.referralCount : 0;

    return NextResponse.json({
      ok: true,
      data: {
        referralCode: d.username || caller.uid.slice(0, 8),
        referralCount,
        targetCount: 10,
        rewardPassDays: 14,
        unlockedExamPass: Boolean(d.referralExamPassGranted || referralCount >= 10),
        referredBy: d.referredBy || null,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    // An unconfirmed email can be made in seconds, so unverified accounts cannot farm referral XP or the free exam pass.
    requireVerifiedEmail(caller);
    const limited = await checkRateLimit(req, {
      uid: caller.uid,
      keyPrefix: "referral_claim",
      limit: 5,
      windowMs: 60_000, shared: true
    });
    if (limited) return limited;

    const body = await parseJson(req, claimReferralSchema);
    const handle = body.referrerUsername.toLowerCase().replace(/^@/, "");

    const db = adminDb();
    const callerRef = db.collection("users").doc(caller.uid);

    const refQuery = await db.collection("users").where("username", "==", handle).limit(1).get();
    if (refQuery.empty) {
      throw new ApiError(404, "NOT_FOUND", "No student or Class Rep found with that @username.");
    }
    const referrerDoc = refQuery.docs[0];
    if (referrerDoc.id === caller.uid) {
      throw new ApiError(400, "SELF_REFERRAL", "You cannot use your own referral handle.");
    }

    // The "already claimed" check and the XP are one transaction: two parallel requests can no longer both pass the check and double the reward.
    const out = await db.runTransaction(async (tx) => {
      const [callerSnap, referrerSnap] = await Promise.all([tx.get(callerRef), tx.get(referrerDoc.ref)]);
      const callerData = callerSnap.data() || {};
      const referrerData = referrerSnap.data() || {};
      if (callerData.referredBy) {
        throw new ApiError(400, "ALREADY_CLAIMED", "You have already claimed a campus referral code.");
      }
      if ((callerData.username || "").toLowerCase() === handle) {
        throw new ApiError(400, "SELF_REFERRAL", "You cannot use your own referral handle.");
      }
      const nextCount = (typeof referrerData.referralCount === "number" ? referrerData.referralCount : 0) + 1;
      const hitMilestone = nextCount >= 10 && !referrerData.referralExamPassGranted;

      tx.set(
        callerRef,
        { referredBy: referrerDoc.id, referredByHandle: handle, xp: FieldValue.increment(250), updatedAt: Timestamp.now() },
        { merge: true }
      );

      const referrerUpdates: Record<string, unknown> = {
        referralCount: nextCount,
        xp: FieldValue.increment(250),
        updatedAt: Timestamp.now(),
      };
      if (hitMilestone) {
        const currentPlan = referrerData.plan || "free";
        const existingExpiryMs =
          referrerData.planExpiresAt?.toMillis?.() || (typeof referrerData.planExpiresAt === "number" ? referrerData.planExpiresAt : 0);
        const baseMs = Math.max(Date.now(), existingExpiryMs);
        referrerUpdates.referralExamPassGranted = true;
        if (currentPlan === "free" || currentPlan === "exam") {
          referrerUpdates.plan = "exam";
          referrerUpdates.planExpiresAt = Timestamp.fromMillis(baseMs + 14 * 86_400_000);
        }
      }
      tx.set(referrerDoc.ref, referrerUpdates, { merge: true });

      tx.set(referrerDoc.ref.collection("notifications").doc(), {
        type: "referral",
        title: hitMilestone ? "10 Coursemates Referred — 14-Day Exam Pass Unlocked!" : `New Campus Referral (+250 XP)! (${nextCount}/10)`,
        body: hitMilestone
          ? "You hit 10 campus referrals! Your 14-day Exam Pass for Past Questions & CBT is now active."
          : `${callerData.displayName || "A coursemate"} joined with your invite link. ${Math.max(0, 10 - nextCount)} more for a free 14-Day Exam Pass!`,
        href: "/dashboard",
        icon: "gift",
        sproutMood: "dance",
        read: false,
        createdAt: Timestamp.now(),
      });
      return { hitMilestone };
    });
    const hitMilestone = out.hitMilestone;

    return NextResponse.json({
      ok: true,
      data: {
        xpAwarded: 250,
        referrerHandle: handle,
        milestoneUnlocked: hitMilestone,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
