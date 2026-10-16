"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type State = Record<"lesson" | "audio" | "simulation" | "practice", boolean>;

const ITEMS: Array<{ key: keyof State; label: string }> = [
  { key: "lesson", label: "Lecture note" },
  { key: "audio", label: "Voice-over podcast" },
  { key: "simulation", label: "Simulation" },
  { key: "practice", label: "Flashcards & quiz" },
];

/**
 * Teachers prepare everything first (the AI work happens once, on their side), then publish. Students only
 * see published material and never trigger generation themselves.
 */
export function PublishBar({ classId, kcId, state, labDrafts, onChanged }: { classId: string; kcId: string; state: State; labDrafts: number; onChanged: (next: State, labsPublished?: boolean) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const allLive = ITEMS.every((i) => state[i.key]) && labDrafts === 0;

  const send = async (keys: string[] | "all", published: boolean, busyKey: string) => {
    setBusy(busyKey);
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${kcId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys, published }) }).then((r) => r.json());
      if (j.ok) {
        onChanged(j.data.published as State, keys === "all" || (Array.isArray(keys) && keys.includes("labs")) ? published : undefined);
        toast({ title: published ? "Published — students can see it now" : "Hidden from students", variant: "success" });
      } else toast({ title: "Couldn't update", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't update", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold flex items-center gap-1.5 flex-1 min-w-0">
          <Megaphone className="h-4 w-4 text-amber-600" /> What students can see
        </p>
        <Button size="sm" onClick={() => send("all", !allLive, "all")} isLoading={busy === "all"} variant={allLive ? "outline" : "default"}>
          {allLive ? "Hide everything" : "Publish everything"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">Students only see what you publish and can&apos;t generate anything themselves. Check each piece, then publish it.</p>
      <div className="flex flex-wrap gap-2">
        {ITEMS.map((i) => (
          <button
            key={i.key}
            type="button"
            disabled={busy !== null}
            onClick={() => send([i.key], !state[i.key], i.key)}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold", state[i.key] ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300")}
            title={state[i.key] ? "Click to hide from students" : "Click to publish to students"}
          >
            {state[i.key] ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {i.label}: {busy === i.key ? "…" : state[i.key] ? "Published" : "Draft"}
          </button>
        ))}
        <button
          type="button"
          disabled={busy !== null || labDrafts === 0}
          onClick={() => send(["labs"], true, "labs")}
          className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold", labDrafts === 0 ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-slate-300 dark:border-slate-700")}
          title="Each lab also has its own publish button in the Build & test tab"
        >
          {labDrafts === 0 ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Build labs: {busy === "labs" ? "…" : labDrafts === 0 ? "Published" : `${labDrafts} draft${labDrafts > 1 ? "s" : ""} — publish all`}
        </button>
      </div>
    </div>
  );
}
