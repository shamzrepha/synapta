import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { safeBktParams } from "@/lib/bkt/engine";
import { nextStreak } from "@/lib/game/streak";
import { trackProgress } from "@/lib/game/progress";

export const runtime = "nodejs";

const signalSchema = z.object({
  kcId: z.string().trim().min(1).max(120),
  event: z.enum(["page_turn", "term_explore", "interactive_play", "check_pass", "chapter_complete"]),
  concept: z.string().trim().max(120).optional(),
  subtopic: z.string().trim().max(160).optional(),
});

/** Reading can earn at most this much XP per learner per day, across every topic (per-topic caps alone could be farmed). */
export const READING_XP_DAILY_CAP = 60;

/** Concept names come from the browser and are kept in the learner's profile: keep them short plain text. */
const cleanConcept = (s: string) => s.replace(/[<>`{}\[\]\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const BONUS_LABEL: Record<z.infer<typeof signalSchema>["event"], string> = {
  page_turn: "Reading mapped",
  term_explore: "Concept mapped",
  interactive_play: "Interactive exploration bonus",
  check_pass: "Quick-check mastery bonus",
  chapter_complete: "Chapter focus bonus",
};

/**
 * Records authentic textbook reading interactions (concept lookups, inline simulation exploration,
 * quick self-checks, and topic completion) into the student's BKT mental map and awards
 * daily-capped focus XP bonuses.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: classId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "read_signal", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const access = await assertClassAccess(caller, classId, "view");
    const body = await parseJson(req, signalSchema);

    if (!access.isEnrolled) {
      return NextResponse.json({
        ok: true,
        data: { enrolled: false, xpGained: 0, pL: null, exploredCount: 0, bonusLabel: null },
      });
    }

    const uid = caller.uid;
    const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(body.kcId);
    const masteryRef = adminDb().collection("mastery").doc(`${uid}_${body.kcId}`);
    const userRef = adminDb().collection("users").doc(uid);
    const profileRef = adminDb().collection("learnerProfiles").doc(uid);
    const todayStr = new Date().toISOString().split("T")[0];

    const tx = await adminDb().runTransaction(async (t) => {
      const [kcSnap, masterySnap, userSnap, profileSnap] = await Promise.all([
        t.get(kcRef),
        t.get(masteryRef),
        t.get(userRef),
        t.get(profileRef),
      ]);
      if (!kcSnap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found.");

      const kcData = kcSnap.data() || {};
      // learners only earn on topics the teacher has published
      if (kcData.status === "draft" || kcData.status === "archived") throw new ApiError(404, "NOT_FOUND", "Topic not found.");
      const mData = masterySnap.exists ? (masterySnap.data() || {}) : {};
      const { pL0 } = safeBktParams(kcData.bkt);
      const pLPrev = typeof mData.pL === "number" ? mData.pL : pL0;

      const sameDay = mData.readRewardDate === todayStr;
      let readTermsToday = sameDay && Array.isArray(mData.readTermsToday) ? (mData.readTermsToday as string[]) : [];
      let readPlaysToday = sameDay ? Number(mData.readPlaysToday || 0) : 0;
      let readCheckToday = sameDay ? Boolean(mData.readCheckToday) : false;
      let readChapterToday = sameDay ? Boolean(mData.readChapterToday) : false;

      const existingExplored = Array.isArray(mData.exploredTerms) ? (mData.exploredTerms as string[]) : [];
      const concept = cleanConcept(body.concept || body.subtopic || "");
      const nextExplored =
        concept && !existingExplored.some((x) => x.toLowerCase() === concept.toLowerCase())
          ? [...existingExplored, concept].slice(-30)
          : existingExplored;
      // a quick check or a finished chapter only counts after pages of this topic were actually turned
      const pagesRead = Number(mData.readingPages || 0);
      const earnedReading = pagesRead >= 2;

      let xpGained = 0;
      let pLCeiling = 0.38;
      let pLDelta = 0.012;

      if (body.event === "term_explore") {
        pLCeiling = 0.48;
        pLDelta = 0.03;
        const termKey = (concept || "term").toLowerCase();
        if (readTermsToday.length < 2 && !readTermsToday.includes(termKey)) {
          readTermsToday = [...readTermsToday, termKey];
          xpGained = 5;
        }
      } else if (body.event === "interactive_play") {
        pLCeiling = 0.48;
        pLDelta = 0.04;
        if (readPlaysToday < 1) {
          readPlaysToday += 1;
          xpGained = 5;
        }
      } else if (body.event === "check_pass") {
        pLCeiling = 0.52;
        pLDelta = 0.06;
        if (!readCheckToday && earnedReading) {
          readCheckToday = true;
          xpGained = 10;
        }
      } else if (body.event === "chapter_complete") {
        pLCeiling = 0.52;
        pLDelta = 0.05;
        if (!readChapterToday && earnedReading) {
          readChapterToday = true;
          xpGained = 15;
        }
      }

      // one daily ceiling across all topics: whatever is over it is simply not paid
      const userData0 = userSnap.exists ? userSnap.data() : {};
      const paidToday = userData0?.readXpDate === todayStr ? Number(userData0?.readXpToday || 0) : 0;
      xpGained = Math.max(0, Math.min(xpGained, READING_XP_DAILY_CAP - paidToday));

      // Reading deepens initial conceptual mental map gently without bypassing full quiz/lab mastery (0.95)
      const pLAfter =
        pLPrev < pLCeiling ? Math.min(pLCeiling, Math.round((pLPrev + pLDelta) * 1000) / 1000) : pLPrev;

      t.set(
        masteryRef,
        {
          uid,
          classId,
          kcId: body.kcId,
          pL: pLAfter,
          attempts: typeof mData.attempts === "number" ? mData.attempts : 0,
          correct: typeof mData.correct === "number" ? mData.correct : 0,
          exploredTerms: nextExplored,
          readingPages: Number(mData.readingPages || 0) + (body.event === "page_turn" ? 1 : 0),
          readRewardDate: todayStr,
          readTermsToday,
          readPlaysToday,
          readCheckToday,
          readChapterToday,
          lastReadAt: Timestamp.now(),
          lastUpdated: Timestamp.now(),
        },
        { merge: true }
      );

      // Update Learner Profile recent reading mental map entries for AI Tutor awareness
      const prevMap = Array.isArray(profileSnap.data()?.readingMentalMap)
        ? (profileSnap.data()!.readingMentalMap as Array<Record<string, unknown>>)
        : [];
      const topicTitle = String(kcData.title || "");
      const updatedMap = [
        {
          classId,
          kcId: body.kcId,
          topicTitle,
          concept: concept || cleanConcept(body.subtopic || "") || topicTitle,
          pL: pLAfter,
          exploredCount: nextExplored.length,
          updatedAt: Date.now(),
        },
        ...prevMap.filter((e) => e.kcId !== body.kcId),
      ].slice(0, 12);
      t.set(profileRef, { readingMentalMap: updatedMap, updatedAt: Timestamp.now() }, { merge: true });

      const userData = userSnap.exists ? userSnap.data() : {};
      let totalXp = Number(userData?.xp || 0);
      let streakDays = Number(userData?.streakDays || 1);

      if (xpGained > 0 && userSnap.exists) {
        totalXp += xpGained;
        const streakRes = nextStreak({
          current: streakDays,
          lastActiveDate: (userData?.lastActiveDate as string | null) ?? null,
          today: todayStr,
          freezes: Number(userData?.streakFreezes || 0),
        });
        streakDays = streakRes.streak;
        t.update(userRef, {
          xp: totalXp,
          streakDays,
          streakFreezes: streakRes.freezes,
          readXpDate: todayStr,
          readXpToday: paidToday + xpGained,
          lastActiveDate: todayStr,
          updatedAt: Timestamp.now(),
        });
      }

      return {
        enrolled: true,
        xpGained,
        totalXp,
        streakDays,
        pL: pLAfter,
        exploredCount: nextExplored.length,
        bonusLabel: xpGained > 0 ? BONUS_LABEL[body.event] : null,
      };
    });

    if (tx.xpGained > 0) {
      await trackProgress({
        uid,
        xpAlreadyApplied: tx.xpGained,
        countsForQuests: true,
        reason: `reading:${body.event}`,
      });
    }

    return NextResponse.json({ ok: true, data: tx });
  } catch (error) {
    return handleAuthError(error);
  }
}
