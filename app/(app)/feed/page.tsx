"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Newspaper, Globe, GraduationCap, ArrowUp, Users, Hash, TrendingUp, Bookmark, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Composer } from "@/components/feed/composer";
import { AchievementPrompts } from "@/components/feed/achievement-prompts";
import { PostCard, type FeedPost } from "@/components/feed/post-card";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";

interface ClassLite {
  id: string;
  title: string;
  isOwner?: boolean;
  userEnrollmentStatus?: string;
}

/** scope: "global" | "following" | "tag:<tag>" | "<classId>" */
async function fetchFeed(scope: string, before?: string | null) {
  const qs = new URLSearchParams();
  if (scope === "global" || scope === "following") qs.set("scope", scope);
  else if (scope.startsWith("tag:")) {
    qs.set("scope", "tag");
    qs.set("tag", scope.slice(4));
  } else {
    qs.set("scope", "class");
    qs.set("classId", scope);
  }
  if (before) qs.set("before", before);
  try {
    const res = await fetch(`/api/feed?${qs}`);
    const data = await res.json();
    return data.ok ? (data.data as { posts: FeedPost[]; hasMore: boolean; channel: string }) : null;
  } catch {
    return null;
  }
}

function Trending({ onPick }: { onPick: (tag: string) => void }) {
  const [tags, setTags] = useState<Array<{ tag: string; recent: number }> | null>(null);
  useEffect(() => {
    fetch("/api/hashtags/trending")
      .then((r) => r.json())
      .then((j) => setTags(j.ok ? j.data.trending : []))
      .catch(() => setTags([]));
  }, []);
  return (
    <Card className="p-4 space-y-3">
      <p className="font-bold flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-rose-500" /> Trending
      </p>
      {tags === null ? (
        <Skeleton className="h-24 w-full" />
      ) : tags.length === 0 ? (
        <p className="text-xs text-slate-500">No trends yet. Use #hashtags in your posts to start one.</p>
      ) : (
        <ol className="space-y-2">
          {tags.map((t, i) => (
            <li key={t.tag}>
              <button type="button" onClick={() => onPick(t.tag)} className="w-full text-left group">
                <p className="text-[11px] text-slate-400">{i + 1} · Trending</p>
                <p className="text-sm font-bold group-hover:underline">#{t.tag}</p>
                <p className="text-[11px] text-slate-500">
                  {t.recent} post{t.recent === 1 ? "" : "s"} in the last 3 days
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function FeedPage() {
  const { user } = useUserStore();
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [scope, setScope] = useState<string>("global");
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [channel, setChannel] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [focusPost, setFocusPost] = useState<FeedPost | null>(null);
  const postsRef = useRef<FeedPost[] | null>(null);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("post");
    const cls = params.get("class");
    const tag = params.get("tag");
    const t = setTimeout(() => {
      if (cls) setScope(cls);
      else if (tag) setScope(`tag:${tag.toLowerCase()}`);
    }, 0);
    if (p) {
      fetch(`/api/feed/${p}`)
        .then((r) => r.json())
        .then((j) => j.ok && setFocusPost(j.data.post))
        .catch(() => null);
    }
    fetch("/api/classes?scope=mine")
      .then((r) => r.json())
      .then((j) => setClasses(asArray<ClassLite>(j.ok ? j.data : []).filter((c) => c.isOwner || c.userEnrollmentStatus === "active")))
      .catch(() => null);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchFeed(scope).then((d) => {
      if (ignore) return;
      setPosts(d?.posts || []);
      setHasMore(!!d?.hasMore);
      setChannel(d?.channel || null);
      setNewCount(0);
    });
    return () => {
      ignore = true;
    };
  }, [scope]);

  const reloadTop = useCallback(async () => {
    const d = await fetchFeed(scope);
    if (!d) return;
    const prev = postsRef.current || [];
    const known = new Set(prev.map((p) => p.id));
    const fresh = d.posts.filter((p) => !known.has(p.id));
    const updated = new Map(d.posts.map((p) => [p.id, p]));
    setPosts([...fresh, ...prev.map((p) => updated.get(p.id) || p)]);
    const othersNew = fresh.filter((p) => !p.mine).length;
    if (othersNew > 0 && window.scrollY > 400) setNewCount((n) => n + othersNew);
  }, [scope]);

  useLiveChannel(channel, reloadTop);

  const loadMore = async () => {
    if (!posts || posts.length === 0) return;
    setLoadingMore(true);
    const d = await fetchFeed(scope, posts[posts.length - 1].createdAt);
    if (d) {
      setPosts((prev) => [...(prev || []), ...d.posts.filter((p) => !(prev || []).some((x) => x.id === p.id))]);
      setHasMore(d.hasMore);
    }
    setLoadingMore(false);
  };

  const pick = (s: string) => {
    setPosts(null);
    setScope(s);
    window.history.replaceState(null, "", s.startsWith("tag:") ? `/feed?tag=${s.slice(4)}` : "/feed");
  };

  const classTitle = (id: string | null) => (id ? classes.find((c) => c.id === id)?.title : undefined);
  const currentClass = classes.find((c) => c.id === scope);
  const tag = scope.startsWith("tag:") ? scope.slice(4) : null;

  const tabs = [
    { key: "global", label: "Everyone", icon: <Globe className="h-4 w-4" /> },
    { key: "following", label: "Following", icon: <Users className="h-4 w-4" /> },
    ...asArray(classes).map((c) => ({ key: c.id, label: c.title, icon: <GraduationCap className="h-4 w-4" /> })),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 max-w-5xl mx-auto">
      <div className="space-y-4 min-w-0">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              <Newspaper className="h-7 w-7 text-teal-600" /> Community
            </h1>
            <p className="text-sm text-slate-500">Questions, wins and projects from your classmates — live.</p>
          </div>
          <Link href="/saved" className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-teal-600">
            <Bookmark className="h-4 w-4" /> Saved
          </Link>
        </div>

        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => pick(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap",
                scope === t.key ? "bg-teal-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tag && (
          <Card className="p-4 flex items-center justify-between">
            <p className="font-bold text-lg flex items-center gap-1">
              <Hash className="h-5 w-5 text-teal-600" />
              {tag}
            </p>
            <button onClick={() => pick("global")} className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </Card>
        )}

        {focusPost && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Shared with you</p>
              <button onClick={() => setFocusPost(null)} className="text-xs text-slate-500 flex items-center gap-1">
                <X className="h-3.5 w-3.5" /> Close
              </button>
            </div>
            <PostCard post={focusPost} defaultOpen classLabel={classTitle(focusPost.classId)} onDeleted={() => setFocusPost(null)} />
          </div>
        )}

        {user && !tag && <AchievementPrompts onPosted={reloadTop} />}
        {user && !tag && scope !== "following" && <Composer key={scope} classes={classes} defaultClassId={currentClass ? scope : undefined} onPosted={reloadTop} />}

        {newCount > 0 && (
          <div className="sticky top-16 z-20 flex justify-center">
            <Button
              size="sm"
              className="rounded-full shadow-lg"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setNewCount(0);
              }}
            >
              <ArrowUp className="h-4 w-4 mr-1" /> {newCount} new post{newCount > 1 ? "s" : ""}
            </Button>
          </div>
        )}

        {posts === null ? (
          <div className="space-y-3">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
        ) : posts.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">
            {scope === "following"
              ? "Follow people (tap their name on any post) to fill this feed."
              : tag
              ? `No posts with #${tag} yet.`
              : `No posts yet. Start the conversation${currentClass ? ` in ${currentClass.title}` : ""}!`}
          </Card>
        ) : (
          <div className="space-y-3">
            {posts
              .filter((p) => p.id !== focusPost?.id)
              .map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  canModerate={user?.role === "admin" || (!!currentClass?.isOwner && p.classId === currentClass.id)}
                  classLabel={scope === "global" ? classTitle(p.classId) : undefined}
                  onDeleted={(id) => setPosts((prev) => (prev || []).filter((x) => x.id !== id))}
                />
              ))}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={loadMore} isLoading={loadingMore}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="hidden lg:block space-y-4 sticky top-20 self-start">
        <Trending onPick={(t) => pick(`tag:${t}`)} />
      </aside>
    </div>
  );
}
