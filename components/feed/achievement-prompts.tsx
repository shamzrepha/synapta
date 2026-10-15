"use client";

import React, { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useToast } from "@/components/ui/toast";
import { useRealtime } from "@/components/providers/realtime-provider";
import { asArray } from "@/lib/api/client";

interface Pending {
  id: string;
  text: string;
}

async function fetchPending(): Promise<Pending[] | null> {
  try {
    const j = await fetch("/api/me/achievements").then((r) => r.json());
    return j.ok ? asArray<Pending>(j.data.items) : null;
  } catch {
    return null;
  }
}

/** Achievements waiting for the learner to decide: post to the community (with a caption) or dismiss. */
export function AchievementPrompts({ onPosted, max = 3 }: { onPosted?: () => void; max?: number }) {
  const { toast } = useToast();
  const { signalVersion } = useRealtime();
  const [items, setItems] = useState<Pending[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchPending().then((r) => r && setItems(r));
  }, [signalVersion]);

  const act = async (id: string, action: "post" | "dismiss") => {
    setBusy(id);
    try {
      const j = await fetch(`/api/me/achievements/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, caption: captions[id] || undefined }),
      }).then((r) => r.json());
      setItems((prev) => prev.filter((p) => p.id !== id));
      if (action === "post") {
        if (j.ok) {
          toast({ title: "Posted to the community 🎉", variant: "success" });
          onPosted?.();
        } else toast({ title: "Couldn't post", description: j.error?.message, variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.slice(0, max).map((it) => (
        <Card key={it.id} className="p-3 border-amber-300/60 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <PartyPopper className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-sm">
                <MarkdownRenderer content={`You ${it.text}`} />
              </div>
              <input
                value={captions[it.id] || ""}
                onChange={(e) => setCaptions((c) => ({ ...c, [it.id]: e.target.value }))}
                maxLength={500}
                placeholder="Add a caption (optional)"
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" isLoading={busy === it.id} onClick={() => act(it.id, "post")}>
                  Post to community
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" disabled={busy === it.id} onClick={() => act(it.id, "dismiss")}>
                  Not now
                </Button>
              </div>
            </div>
            <button type="button" onClick={() => act(it.id, "dismiss")} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
