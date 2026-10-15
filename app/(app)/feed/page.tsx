"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Newspaper, Globe, GraduationCap, ArrowUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Composer } from "@/components/feed/composer";
import { PostCard, type FeedPost } from "@/components/feed/post-card";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";

interface ClassLite {
  id: string;
  title: string;
  isOwner?: boolean;
}

async function fetchFeed(scope: string, before?: string | null) {
  const qs = new URLSearchParams();
  if (scope === "global") qs.set("scope", "global");
  else {
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

export default function FeedPage() {
  const { user } = useUserStore();
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [scope, setScope] = useState<string>("global");
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [channel, setChannel] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [focusPost, setFocusPost] = useState<string | null>(null);
  const postsRef = useRef<FeedPost[] | null>(null);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("post");
    const cls = params.get("class");
    const t = setTimeout(() => {
      setFocusPost(p);
      if (cls) setScope(cls);
    }, 0);
    fetch("/api/classes?scope=mine")
      .then((r) => r.json())
      .then((j) => setClasses(asArray<ClassLite>(j.ok ? j.data : [])))
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
    // Merge in new posts and refresh counts on the first page; keep older pages as they are
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

  const classTitle = (id: string | null) => (id ? classes.find((c) => c.id === id)?.title : undefined);
  const currentClass = classes.find((c) => c.id === scope);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Newspaper className="h-7 w-7 text-teal-600" /> Community
        </h1>
        <p className="text-sm text-slate-500">Questions, wins and projects from your classmates — live.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
        <button
          onClick={() => setScope("global")}
          className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap", scope === "global" ? "bg-teal-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900")}
        >
          <Globe className="h-4 w-4" /> Everyone
        </button>
        {asArray(classes).map((c) => (
          <button
            key={c.id}
            onClick={() => setScope(c.id)}
            className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap", scope === c.id ? "bg-teal-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900")}
          >
            <GraduationCap className="h-4 w-4" /> {c.title}
          </button>
        ))}
      </div>

      {user && <Composer key={scope} classes={classes} defaultClassId={scope !== "global" ? scope : undefined} onPosted={reloadTop} />}

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
          No posts yet. Start the conversation{currentClass ? ` in ${currentClass.title}` : ""}!
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              canModerate={user?.role === "admin" || (!!currentClass?.isOwner && p.classId === currentClass.id)}
              defaultOpen={focusPost === p.id}
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
  );
}
