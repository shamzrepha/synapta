import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { resolveUserRef, isFollowing } from "@/lib/social/follow";
import { toPublicProfile } from "@/lib/social/profile";
import { levelFromXp } from "@/lib/game/levels";
import { BADGES, normalizeStats } from "@/lib/game/badges";
import { tierInfo } from "@/lib/game/leagues";

export const runtime = "nodejs";

/** Public profile: never exposes email, quotas or other private fields. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const caller = await requireUser(req);
    const target = await resolveUserRef(userId);
    if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
    const d = target.data;
    const pub = toPublicProfile(target.uid, d);
    const owned = (d.badges || {}) as Record<string, { toDate?: () => Date }>;
    const stats = normalizeStats(d.stats);
    const [following, friend] = await Promise.all([
      target.uid === caller.uid ? Promise.resolve(false) : isFollowing(caller.uid, target.uid),
      adminDb().collection("users").doc(caller.uid).collection("friends").doc(target.uid).get(),
    ]);
    return NextResponse.json({
      ok: true,
      data: {
        uid: target.uid,
        displayName: pub.displayName,
        username: pub.username,
        photoURL: pub.photoURL,
        role: pub.role,
        bio: d.bio || "",
        xp: pub.xp,
        level: levelFromXp(pub.xp),
        streakDays: pub.streakDays,
        league: { tier: pub.leagueTier, ...tierInfo(pub.leagueTier) },
        followerCount: Math.max(0, d.followerCount || 0),
        followingCount: Math.max(0, d.followingCount || 0),
        stats: { masteries: stats.masteries, quizCorrect: stats.quizCorrect, labs: stats.labs, posts: stats.posts, eventWins: stats.eventWins },
        badges: BADGES.filter((b) => owned[b.id]).map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, rarity: b.rarity, description: b.description })),
        isMe: target.uid === caller.uid,
        isFollowing: following,
        isFriend: friend.exists,
        joinedAt: d.createdAt?.toDate?.().toISOString() || null,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
