"use client";

import React, { useEffect, useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentCard } from "@/components/social/attachment-card";
import { timeAgo } from "@/lib/time";

interface Item {
  key: string;
  kind: string;
  title: string;
  subtitle: string;
  href: string;
  createdAt: string | null;
}

export default function SavedPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/bookmarks")
      .then((r) => r.json())
      .then((j) => setItems(j.ok ? j.data.items : []))
      .catch(() => setItems([]));
  }, []);

  const unsave = async (it: Item) => {
    setItems((prev) => (prev || []).filter((x) => x.key !== it.key));
    if (it.kind === "post") await fetch(`/api/feed/${it.key.replace(/^post_/, "")}/bookmark`, { method: "POST" }).catch(() => null);
    else
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved: false, item: { type: it.kind, id: it.key.slice(it.kind.length + 1), title: it.title, href: it.href } }),
      }).catch(() => null);
  };

  const kinds = Array.from(new Set((items || []).map((i) => i.kind)));
  const shown = (items || []).filter((i) => filter === "all" || i.kind === filter);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
        <Bookmark className="h-7 w-7 text-amber-500" /> Saved
      </h1>
      {kinds.length > 1 && (
        <div className="flex gap-1 overflow-x-auto">
          {["all", ...kinds].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${filter === k ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-900"}`}
            >
              {k}
            </button>
          ))}
        </div>
      )}
      {items === null ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : shown.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">Nothing saved yet. Tap Save on posts, topics or notebooks to keep them here.</Card>
      ) : (
        <ul className="space-y-2">
          {shown.map((it) => (
            <li key={it.key} className="flex items-center gap-2">
              <AttachmentCard a={{ type: it.kind, id: it.key, title: it.title, subtitle: `${it.subtitle ? `${it.subtitle} · ` : ""}saved ${timeAgo(it.createdAt)}`, href: it.href }} className="flex-1" />
              <button onClick={() => unsave(it)} className="p-2 text-slate-400 hover:text-rose-600" aria-label="Remove from saved">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
