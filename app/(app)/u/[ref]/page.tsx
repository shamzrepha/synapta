"use client";

import { ShoutoutsStrip } from "@/components/shoutouts/shoutouts-strip";
import React, { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck, MessageCircle, Flame, Share2, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { PostCard, type FeedPost } from "@/components/feed/post-card";
import { ShareSheet } from "@/components/social/share-sheet";
import { useToast } from "@/components/ui/toast";
import { cn, formatNumber } from "@/lib/utils";

interface Profile {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  role: string;
  bio: string;
  xp: number;
  level: { level: number; title: string; progress: number };
  streakDays: number;
  league: { tier: number; name: string; emoji: string };
  followerCount: number;
  followingCount: number;
  stats: { masteries: number; quizCorrect: number; labs: number; posts: number; eventWins: number };
  badges: Array<{ id: string; name: string; emoji: string; rarity: string; description: string }>;
  isMe: boolean;
  isFollowing: boolean;
  isFriend: boolean;
  joinedAt: string | null;
}

const RARITY: Record<string, string> = {
  common: "border-slate-200 dark:border-slate-700",
  rare: "border-sky-400/60 bg-sky-500/5",
  epic: "border-purple-500/60 bg-purple-500/5",
  legendary: "border-amber-400 bg-amber-500/10",
};

async function fetchProfile(ref: string): Promise<{ profile: Profile; posts: FeedPost[] } | null> {
  const j = await fetch(`/api/users/${encodeURIComponent(ref)}/profile`).then((r) => r.json()).catch(() => null);
  if (!j?.ok) return null;
  const f = await fetch(`/api/feed?scope=user&uid=${j.data.uid}`).then((r) => r.json()).catch(() => null);
  return { profile: j.data, posts: f?.ok ? f.data.posts : [] };
}

export default function PublicProfilePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [p, setP] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetchProfile(ref).then((r) => {
      if (ignore) return;
      if (!r) setMissing(true);
      else {
        setP(r.profile);
        setPosts(r.posts);
      }
    });
    return () => {
      ignore = true;
    };
  }, [ref]);

  if (missing) return <Card className="p-10 text-center max-w-xl mx-auto">This profile doesn&apos;t exist.</Card>;
  if (!p) return <Skeleton className="h-64 w-full max-w-3xl mx-auto rounded-2xl" />;

  const follow = async () => {
    setBusy("follow");
    const next = !p.isFollowing;
    setP({ ...p, isFollowing: next, followerCount: p.followerCount + (next ? 1 : -1) });
    const r = await fetch(`/api/users/${p.uid}/follow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ follow: next }) }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      setP({ ...p });
      toast({ title: "Couldn't update", description: r?.error?.message, variant: "destructive" });
    }
    setBusy(null);
  };

  const message = async () => {
    setBusy("message");
    const r = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "direct", uid: p.uid }) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (r?.ok) router.push(`/messages?chat=${r.data.id}`);
    else toast({ title: "Can't message yet", description: r?.error?.message, variant: "destructive" });
  };

  const addFriend = async () => {
    setBusy("friend");
    const r = await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUid: p.uid }) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    toast({ title: r?.ok ? "Friend request sent" : "Couldn't send request", description: r?.ok ? undefined : r?.error?.message, variant: r?.ok ? "success" : "destructive" });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Card className="overflow-hidden">
        <div className="h-24 sm:h-32 bg-gradient-to-r from-teal-500 via-indigo-500 to-amber-500" />
        <div className="px-4 sm:px-6 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3 -mt-10">
            <div className="rounded-full ring-4 ring-white dark:ring-slate-950">
              <Avatar name={p.displayName} photoURL={p.photoURL} seed={p.uid} size={84} level={p.level.level} />
            </div>
            <div className="flex flex-wrap gap-2 pt-12">
              {!p.isMe && (
                <>
                  <Button size="sm" variant={p.isFollowing ? "outline" : "default"} onClick={follow} isLoading={busy === "follow"}>
                    {p.isFollowing ? <UserCheck className="h-4 w-4 mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                    {p.isFollowing ? "Following" : "Follow"}
                  </Button>
                  {p.isFriend ? (
                    <Button size="sm" variant="outline" onClick={message} isLoading={busy === "message"}>
                      <MessageCircle className="h-4 w-4 mr-1" /> Message
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={addFriend} isLoading={busy === "friend"}>
                      <UserPlus className="h-4 w-4 mr-1" /> Add friend
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => setSharing(true)} aria-label="Share profile">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <h1 className="text-2xl font-extrabold">{p.displayName}</h1>
            <p className="text-sm text-slate-500">
              {p.username ? `@${p.username} · ` : ""}
              {p.level.title} · Level {p.level.level}
              {p.role === "teacher" ? " · Teacher" : ""}
            </p>
            {p.bio && <p className="text-sm mt-2">{p.bio}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
              <span>
                <strong>{formatNumber(p.followerCount)}</strong> <span className="text-slate-500">followers</span>
              </span>
              <span>
                <strong>{formatNumber(p.followingCount)}</strong> <span className="text-slate-500">following</span>
              </span>
              <span className="flex items-center gap-1">
                <Flame className="h-4 w-4 text-amber-500" /> {p.streakDays}-day streak
              </span>
              <span>
                {p.league.emoji} {p.league.name} League
              </span>
              {p.joinedAt && (
                <span className="flex items-center gap-1 text-slate-500">
                  <CalendarDays className="h-4 w-4" /> Joined {new Date(p.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          ["XP", formatNumber(p.xp)],
          ["Mastered", p.stats.masteries],
          ["Quiz correct", p.stats.quizCorrect],
          ["Labs", p.stats.labs],
          ["Wins", p.stats.eventWins],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-3 text-center">
            <p className="text-lg font-extrabold">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </Card>
        ))}
      </div>

      <ShoutoutsStrip userRef={p.uid} />
      {p.badges.length > 0 && (
        <Card className="p-4 space-y-3">
          <p className="font-bold">Badges ({p.badges.length})</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {p.badges.map((b) => (
              <div key={b.id} title={`${b.name} — ${b.description}`} className={cn("aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-1", RARITY[b.rarity])}>
                <span className="text-2xl">{b.emoji}</span>
                <span className="text-[9px] font-semibold text-center leading-tight line-clamp-2">{b.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-bold">Posts</h2>
        {posts === null ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : posts.length === 0 ? (
          <Card className="p-8 text-center text-sm text-slate-500">No public posts yet.</Card>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} onDeleted={(id) => setPosts((prev) => (prev || []).filter((x) => x.id !== id))} />)
        )}
      </div>

      {sharing && (
        <ShareSheet
          attachment={{ type: "profile", id: p.uid, title: p.displayName, subtitle: `Level ${p.level.level} ${p.level.title}`, href: `/u/${p.username || p.uid}` }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}
