import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { updateMastery, Activity, OMEGA, MASTERY_THRESHOLD } from "@/lib/bkt/engine";
import { z } from "zod";

export const runtime = "nodejs";

const evidenceInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  activity: z.enum(["quiz", "flashcard", "lab", "peer_explain"]),
  correct: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = evidenceInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }

    const { classId, kcId, activity, correct } = parsed.data;

    // References for transaction
    const userRef = adminDb().collection("users").doc(caller.uid);
    const masteryDocId = `${caller.uid}_${kcId}`;
    const masteryRef = adminDb().collection("mastery").doc(masteryDocId);
    const evidenceRef = adminDb().collection("evidence").doc();
    const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);

    // Run transaction
    const result = await adminDb().runTransaction(async (t) => {
      // 1. Read KC doc for BKT parameters
      const kcDoc = await t.get(kcRef);
      const kcData = kcDoc.exists ? kcDoc.data() : null;

      const pL0 = kcData?.bkt?.pL0 ?? 0.20;
      const pT = kcData?.bkt?.pT ?? 0.15;
      const pG = kcData?.bkt?.pG ?? 0.20;
      const pS = kcData?.bkt?.pS ?? 0.10;

      // 2. Read existing Mastery doc
      const masteryDoc = await t.get(masteryRef);
      const pLPrev = masteryDoc.exists ? (masteryDoc.data()?.pL ?? pL0) : pL0;
      const prevAttempts = masteryDoc.exists ? (masteryDoc.data()?.attempts ?? 0) : 0;
      const prevCorrect = masteryDoc.exists ? (masteryDoc.data()?.correct ?? 0) : 0;
      const lastLabAt = masteryDoc.exists ? masteryDoc.data()?.lastLabAt : null;

      // Anti-farming guard: max 1 lab completion per 10 minutes per KC
      if (activity === "lab" && lastLabAt) {
        const lastLabMillis = typeof lastLabAt.toMillis === "function"
          ? lastLabAt.toMillis()
          : new Date(lastLabAt).getTime();
        const diffMinutes = (Date.now() - lastLabMillis) / (1000 * 60);
        if (diffMinutes < 10) {
          const waitTime = Math.ceil(10 - diffMinutes);
          const err = new Error(
            `Lab evidence rate-limited. Please wait ${waitTime} more minute(s) before resubmitting for this concept.`
          );
          (err as { code?: string; status?: number }).code = "LAB_RATE_LIMITED";
          (err as { code?: string; status?: number }).status = 429;
          throw err;
        }
      }

      // 3. Compute new mastery via BKT engine
      const pLAfter = updateMastery(pLPrev, correct, { pT, pG, pS }, activity as Activity);

      const crossedMasteryFirstTime = pLPrev < MASTERY_THRESHOLD && pLAfter >= MASTERY_THRESHOLD;

      // 4. Calculate XP
      let xpEarned = 1; // base effort for attempting
      if (correct) {
        if (activity === "quiz") xpEarned = 10;
        else if (activity === "flashcard") xpEarned = 5;
        else if (activity === "lab") xpEarned = 30;
        else if (activity === "peer_explain") xpEarned = 40;
      }
      if (crossedMasteryFirstTime) {
        xpEarned += 100; // Mastery achievement reward
      }

      // 5. Read User doc for streak and XP calculation
      const userDoc = await t.get(userRef);
      const userData = userDoc.exists ? userDoc.data() : null;

      const currentXp = (userData?.xp ?? 0) + xpEarned;
      const currentStreak = userData?.streakDays ?? 1;
      const lastActiveDate = userData?.lastActiveDate ?? null;

      const todayStr = new Date().toISOString().split("T")[0];
      let newStreak = currentStreak;

      if (lastActiveDate) {
        const lastDate = new Date(lastActiveDate);
        const today = new Date(todayStr);
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          newStreak = currentStreak + 1;
        } else if (diffDays > 1 && lastActiveDate !== todayStr) {
          newStreak = 1;
        }
      }

      // 6. Transactional writes
      // Update mastery doc
      const masteryUpdates: Record<string, unknown> = {
        uid: caller.uid,
        classId,
        kcId,
        pL: pLAfter,
        attempts: prevAttempts + 1,
        correct: prevCorrect + (correct ? 1 : 0),
        lastUpdated: Timestamp.now(),
      };
      if (activity === "lab") {
        masteryUpdates.lastLabAt = Timestamp.now();
      }

      t.set(masteryRef, masteryUpdates, { merge: true });

      // Write immutable evidence log
      t.set(evidenceRef, {
        uid: caller.uid,
        classId,
        kcId,
        activity,
        correct,
        omega: OMEGA[activity as Activity],
        pLBefore: pLPrev,
        pLAfter,
        xpEarned,
        createdAt: Timestamp.now(),
      });

      // Update user doc
      t.update(userRef, {
        xp: currentXp,
        streakDays: newStreak,
        lastActiveDate: todayStr,
        updatedAt: Timestamp.now(),
      });

      return {
        pLBefore: pLPrev,
        pLAfter,
        xpGained: xpEarned,
        totalXp: currentXp,
        streakDays: newStreak,
        mastered: pLAfter >= MASTERY_THRESHOLD,
        crossedMasteryFirstTime,
      };
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "LAB_RATE_LIMITED") {
      const err = error as { code: string; message: string; status?: number };
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message } },
        { status: err.status || 429 }
      );
    }
    return handleAuthError(error);
  }
}
