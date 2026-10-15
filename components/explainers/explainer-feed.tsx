"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { ExplainerCard, type ExplainerItem } from "./explainer-card";

async function load(mine: boolean, tag: string): Promise<ExplainerItem[] | null> {
  try {
    const qs = new URLSearchParams();
    if (mine) qs.set("mine", "1");
    if (tag) qs.set("tag", tag);
    const j = await fetch(`/api/explainers?${qs}`).then((r) => r.json());
    return j.ok ? asArray<ExplainerItem>(j.data) : null;
  } catch {
    return null;
  }
}

/** Scrolling feed of explainers; `mine` shows only the caller's with a delete button. `version` reloads. */
export function ExplainerFeed({ mine = false, version = 0 }: { mine?: boolean; version?: number }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ExplainerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tag, setTag] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tag") || "";
    let ignore = false;
    load(mine, t).then((r) => {
      if (ignore) return;
      setTag(t);
      setFailed(!r);
      setItems(r || []);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [mine, version]);

  const like = useCallback(
    async (id: string) => {
      setItems((cur) => cur.map((i) => (i.id === id ? { ...i, liked: !i.liked, likeCount: i.likeCount + (i.liked ? -1 : 1) } : i)));
      const j = await fetch(`/api/explainers/${id}/like`, { method: "POST" })
        .then((r) => r.json())
        .catch(() => null);
      if (j?.ok) setItems((cur) => cur.map((i) => (i.id === id ? { ...i, liked: j.data.liked, likeCount: j.data.likeCount } : i)));
      else {
        setItems((cur) => cur.map((i) => (i.id === id ? { ...i, liked: !i.liked, likeCount: i.likeCount + (i.liked ? -1 : 1) } : i)));
        toast({ title: "Couldn't update your like", variant: "destructive" });
      }
    },
    [toast]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this explainer?")) return;
      const j = await fetch(`/api/explainers/${id}`, { method: "DELETE" })
        .then((r) => r.json())
        .catch(() => null);
      if (j?.ok) {
        setItems((cur) => cur.filter((i) => i.id !== id));
        toast({ title: "Explainer deleted" });
      } else toast({ title: "Couldn't delete", description: j?.error?.message, variant: "destructive" });
    },
    [toast]
  );

  if (loading) return <Skeleton className="h-80 w-full rounded-2xl" />;
  if (failed) return <Card className="p-8 text-center text-sm text-slate-500">Couldn&apos;t load explainers. Try again in a moment.</Card>;
  if (items.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-slate-500">
        {mine ? "You haven't posted an explainer yet." : tag ? `No explainers tagged #${tag} yet.` : "No explainers yet. Be the first to explain something!"}
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {tag && !mine && <p className="text-sm text-slate-500">Showing #{tag}. <a href="/explainers" className="font-semibold text-teal-600">Clear</a></p>}
      {items.map((i) => (
        <ExplainerCard key={i.id} item={i} onLike={like} onDelete={i.isMine ? remove : undefined} />
      ))}
    </div>
  );
}
