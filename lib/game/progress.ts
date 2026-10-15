import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";
import { bumpChannels, bumpUserSignal } from "@/lib/live/server";
import { shareAchievement } from "@/lib/social/feed";
import { levelFromXp } from "./levels";
import { newlyEarnedBadges, normalizeStats, type PlayerStats } from "./badges";
import { questsForDay, dayIdFor, type QuestDef } from "./quests";
import {
  COHORT_SIZE,
  leagueOutcome,
  MAX_TIER,
  tierInfo,
  weekIdFor,
} from "./leagues";

export interface ProgressEvent {
  uid: string;
  /** XP already added to users.xp by the caller (e.g. applyEvidence) */
  xpAlreadyApplied?: number;
  /** XP this call should add (challenges, posts, quests…) */
  xpToAward?: number;
  stats?: Partial<PlayerStats>;
  /** Learning XP counts toward "earn XP" quests; quest rewards themselves don't (no loops). */
  countsForQuests?: boolean;
  reason?: string;
}

/**
 * Single entry point for everything gamified that follows an action: stats, levels, weekly league
 * XP, daily quests and badges, with notifications, feed auto-posts and live leaderboard pings.
 * Best-effort: failures are logged and never break the learning action that triggered them.
 */
export async function trackProgress(ev: ProgressEvent): Promise<void> {
  try {
    await trackProgressInner(ev);
  } catch (err) {
    console.warn("[game] trackProgress failed", err instanceof Error ? err.message : err);
  }
}

async function trackProgressInner(ev: ProgressEvent): Promise<void> {
  const userRef = adminDb().collection("users").doc(ev.uid);
  const award = Math.max(0, Math.round(ev.xpToAward || 0));
  const applied = Math.max(0, Math.round(ev.xpAlreadyApplied || 0));
  const totalXpDelta = award + applied;

  // 1. Stats + XP in one transaction so level-ups are detected exactly once
  const snapshot = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) return null;
    const data = snap.data()!;
    const xpNow = (data.xp || 0) + award;
    const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (award > 0) update.xp = FieldValue.increment(award);
    for (const [k, v] of Object.entries(ev.stats || {})) {
      if (typeof v === "number" && v !== 0) update[`stats.${k}`] = FieldValue.increment(v);
    }
    t.update(userRef, update);
    const stats = normalizeStats(data.stats);
    for (const [k, v] of Object.entries(ev.stats || {})) {
      if (typeof v === "number") stats[k as keyof PlayerStats] += v;
    }
    return {
      oldXp: xpNow - totalXpDelta,
      newXp: xpNow,
      stats,
      streakDays: data.streakDays || 0,
      leagueTier: data.leagueTier || 0,
      leagueLastWeek: data.leagueLastWeek || null,
      badges: (data.badges || {}) as Record<string, unknown>,
    };
  });
  if (!snapshot) return;

  // 2. Level up
  const before = levelFromXp(snapshot.oldXp);
  const after = levelFromXp(snapshot.newXp);
  if (after.level > before.level) {
    await notify(ev.uid, {
      type: "level_up",
      title: `Level up! You're now level ${after.level}`,
      body: `New title: ${after.title}. Keep going!`,
      href: "/profile",
      icon: "⬆️",
    });
    await shareAchievement(ev.uid, `reached **level ${after.level}** (${after.title}) 🎉`, { type: "level", level: after.level });
  }

  // 3. Weekly league XP
  let leagueTier = snapshot.leagueTier;
  if (totalXpDelta > 0) {
    leagueTier = await addLeagueXp(ev.uid, totalXpDelta, snapshot.leagueTier, snapshot.leagueLastWeek);
  }

  // 4. Daily quests
  if (ev.countsForQuests !== false) {
    await advanceQuests(ev.uid, { ...(ev.stats || {}), xp: totalXpDelta });
  }

  // 5. Badges
  const earned = newlyEarnedBadges(
    { stats: snapshot.stats, level: after.level, streakDays: snapshot.streakDays, leagueTier },
    snapshot.badges
  );
  if (earned.length > 0) {
    const upd: Record<string, unknown> = {};
    for (const b of earned) upd[`badges.${b.id}`] = Timestamp.now();
    await userRef.update(upd);
    for (const b of earned) {
      await notify(ev.uid, {
        type: "badge",
        title: `Badge unlocked: ${b.emoji} ${b.name}`,
        body: b.description,
        href: "/profile",
        icon: b.emoji,
      });
      if (b.rarity !== "common") {
        await shareAchievement(ev.uid, `unlocked the **${b.emoji} ${b.name}** badge — ${b.description.toLowerCase()}`, {
          type: "badge",
          badgeId: b.id,
        });
      }
    }
  }

  await bumpUserSignal(ev.uid, { topic: "progress" });
}

/** Adds weekly XP, assigning the learner to a ~30-person cohort in their tier on first XP of the week. */
async function addLeagueXp(uid: string, xp: number, tier: number, lastWeek: string | null): Promise<number> {
  const weekId = weekIdFor();
  let currentTier = tier;

  // Settle last week's result the first time we see this learner in a new week (no cron needed)
  if (lastWeek && lastWeek !== weekId) {
    currentTier = await settleLeagueWeek(uid, lastWeek, tier);
  }

  const entryRef = adminDb().collection("leagueEntries").doc(`${weekId}_${uid}`);
  const entry = await entryRef.get();
  let cohortId: string;
  if (!entry.exists) {
    const counterRef = adminDb().collection("leagueCohorts").doc(`${weekId}_t${currentTier}`);
    cohortId = await adminDb().runTransaction(async (t) => {
      const c = await t.get(counterRef);
      let index = c.exists ? c.data()!.index || 0 : 0;
      let size = c.exists ? c.data()!.size || 0 : 0;
      if (size >= COHORT_SIZE) {
        index += 1;
        size = 0;
      }
      t.set(counterRef, { index, size: size + 1, weekId, tier: currentTier }, { merge: true });
      const id = `${weekId}_t${currentTier}_c${index}`;
      t.set(entryRef, {
        uid,
        weekId,
        tier: currentTier,
        cohortId: id,
        xp: 0,
        createdAt: Timestamp.now(),
      });
      return id;
    });
    await adminDb().collection("users").doc(uid).update({ leagueLastWeek: weekId, leagueTier: currentTier });
  } else {
    cohortId = entry.data()!.cohortId;
  }

  await entryRef.update({ xp: FieldValue.increment(xp), updatedAt: Timestamp.now() });
  await bumpChannels([`league:${cohortId}`, "leaderboard:global", `leaderboard:week:${weekId}`]);
  return currentTier;
}

async function settleLeagueWeek(uid: string, weekId: string, tier: number): Promise<number> {
  const userRef = adminDb().collection("users").doc(uid);
  const entrySnap = await adminDb().collection("leagueEntries").doc(`${weekId}_${uid}`).get();
  if (!entrySnap.exists) return tier;
  const entry = entrySnap.data()!;
  if (entry.settled) return typeof entry.newTier === "number" ? entry.newTier : tier;

  const cohort = adminDb().collection("leagueEntries").where("cohortId", "==", entry.cohortId);
  const [sizeAgg, aboveAgg] = await Promise.all([
    cohort.count().get(),
    cohort.where("xp", ">", entry.xp || 0).count().get(),
  ]);
  const cohortSize = sizeAgg.data().count;
  const rank = aboveAgg.data().count + 1;
  const outcome = leagueOutcome({ rank, cohortSize, tier, xp: entry.xp || 0 });
  const newTier = outcome === "promoted" ? Math.min(MAX_TIER, tier + 1) : outcome === "demoted" ? Math.max(0, tier - 1) : tier;

  await entrySnap.ref.update({ settled: true, finalRank: rank, cohortSize, outcome, newTier });
  await userRef.update({
    leagueTier: newTier,
    ...(outcome === "promoted" ? { "stats.promotions": FieldValue.increment(1) } : {}),
  });

  const info = tierInfo(newTier);
  await notify(uid, {
    type: "league",
    title:
      outcome === "promoted"
        ? `Promoted to ${info.emoji} ${info.name} League!`
        : outcome === "demoted"
        ? `Moved to ${info.emoji} ${info.name} League`
        : `You stayed in ${info.emoji} ${info.name} League`,
    body: `Last week you finished #${rank} of ${cohortSize}.`,
    href: "/leaderboard",
    icon: info.emoji,
  });
  if (outcome === "promoted") {
    await shareAchievement(uid, `was promoted to the **${info.emoji} ${info.name} League** after finishing #${rank} last week!`, {
      type: "league",
      tier: newTier,
    });
  }
  return newTier;
}

async function advanceQuests(uid: string, delta: Partial<Record<string, number>>): Promise<void> {
  const dayId = dayIdFor();
  const quests = questsForDay(uid, dayId);
  const relevant = quests.filter((q) => (delta[q.metric] || 0) > 0);
  if (relevant.length === 0) return;

  const ref = adminDb().collection("users").doc(uid).collection("quests").doc(dayId);
  const completed: QuestDef[] = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const progress: Record<string, { value: number; done: boolean }> = snap.exists ? snap.data()!.progress || {} : {};
    const justDone: QuestDef[] = [];
    for (const q of quests) {
      const cur = progress[q.id] || { value: 0, done: false };
      const inc = delta[q.metric] || 0;
      if (cur.done || inc <= 0) {
        progress[q.id] = cur;
        continue;
      }
      const value = Math.min(q.target, cur.value + inc);
      const done = value >= q.target;
      progress[q.id] = { value, done };
      if (done) justDone.push(q);
    }
    t.set(ref, { dayId, progress, updatedAt: Timestamp.now() }, { merge: true });
    return justDone;
  });

  for (const q of completed) {
    await notify(uid, {
      type: "quest",
      title: `Quest complete: ${q.emoji} ${q.title}`,
      body: `+${q.rewardXp} XP`,
      href: "/dashboard",
      icon: q.emoji,
    });
    // Quest rewards count for level/league but not toward other quests (no feedback loops)
    await trackProgressInner({ uid, xpToAward: q.rewardXp, countsForQuests: false, reason: `quest:${q.id}` });
  }
}

/** Today's quests with progress, for the dashboard. */
export async function getDailyQuests(uid: string) {
  const dayId = dayIdFor();
  const quests = questsForDay(uid, dayId);
  const snap = await adminDb().collection("users").doc(uid).collection("quests").doc(dayId).get();
  const progress: Record<string, { value: number; done: boolean }> = snap.exists ? snap.data()!.progress || {} : {};
  return quests.map((q) => ({
    ...q,
    value: progress[q.id]?.value || 0,
    done: !!progress[q.id]?.done,
  }));
}
