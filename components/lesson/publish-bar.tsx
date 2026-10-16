"use client";

import React, { useCallback, useEffect, useState } from "react";
import { GitCommitHorizontal, Megaphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Key = "lesson" | "audio" | "simulation" | "practice";
interface Status {
  key: Key;
  hasDraft: boolean;
  mode: "off" | "follow" | "snapshot";
  changed: boolean;
  pushedAt: string | null;
}

const LABEL: Record<Key, string> = { lesson: "Lecture note", audio: "Voice-over podcast", simulation: "Simulation", practice: "Flashcards & quiz" };

/**
 * Like pushing a commit: whatever the teacher creates or changes is a private working copy. Students see the
 * last version the teacher pushed — saved audio and content, never regenerated per student — and a newer
 * version only appears for them once the teacher pushes it.
 */
export function PublishBar({ classId, kcId, refreshKey, onLabsChanged }: { classId: string; kcId: string; refreshKey?: string | number; onLabsChanged?: () => void }) {
  const { toast } = useToast();
  const base = `/api/classes/${classId}/kcs/${kcId}/publish`;
  const [status, setStatus] = useState<Status[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await fetch(base).then((r) => r.json());
      if (j.ok) setStatus(j.data.status as Status[]);
    } catch {
      /* the bar just stays as it was */
    }
  }, [base]);
  useEffect(() => {
    let alive = true;
    fetch(base)
      .then((r) => r.json())
      .then((j) => alive && j.ok && setStatus(j.data.status as Status[]))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [base, refreshKey]);

  const send = async (keys: Key[] | string[] | "all", published: boolean, busyKey: string) => {
    setBusy(busyKey);
    try {
      const j = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys, published }) }).then((r) => r.json());
      if (j.ok) {
        setStatus(j.data.status as Status[]);
        onLabsChanged?.();
        toast({ title: published ? "Pushed — students see this version now" : "Taken offline for students", variant: "success" });
      } else toast({ title: "Couldn't update", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't update", variant: "destructive" });
    } finally {
      setBusy(null);
      void load();
    }
  };

  const anyPush = !!status?.some((s) => s.hasDraft && (s.mode === "off" || s.changed));

  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold flex items-center gap-1.5 flex-1 min-w-0">
          <Megaphone className="h-4 w-4 text-amber-600" /> What students see
        </p>
        <Button size="sm" onClick={() => send("all", true, "all")} isLoading={busy === "all"} disabled={!anyPush}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Push everything new
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        What you create here is your working copy. Students only see the last version you <b>push</b> — saved once, replayed for everyone, never regenerated per student. Keep editing; they won&apos;t see changes until you push again.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(status || []).map((s) => {
          const live = s.mode !== "off";
          const state = !s.hasDraft ? "Not created yet" : !live ? "Not live · private draft" : s.changed ? "Live · you have newer changes" : s.mode === "follow" ? "Live (older topic)" : "Live · up to date";
          const canPush = s.hasDraft && (!live || s.changed || s.mode === "follow");
          return (
            <div key={s.key} className={cn("rounded-xl border p-2.5 flex items-center gap-2", live && !s.changed ? "border-emerald-500/40 bg-emerald-500/5" : s.changed ? "border-amber-500/50 bg-amber-500/5" : "border-slate-200 dark:border-slate-800")}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{LABEL[s.key]}</p>
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <GitCommitHorizontal className="h-3 w-3" /> {state}
                  {s.pushedAt && live && <span> · pushed {new Date(s.pushedAt).toLocaleDateString()}</span>}
                </p>
              </div>
              {canPush && (
                <Button size="sm" onClick={() => send([s.key], true, s.key)} isLoading={busy === s.key}>
                  {live ? "Push update" : "Push"}
                </Button>
              )}
              {live && (
                <Button size="sm" variant="outline" onClick={() => send([s.key], false, `off-${s.key}`)} isLoading={busy === `off-${s.key}`}>
                  Take offline
                </Button>
              )}
            </div>
          );
        })}
        {!status && <p className="text-xs text-slate-500">Checking what&apos;s live…</p>}
      </div>
      <p className="text-[11px] text-slate-500">Build labs have their own Push button in the Build &amp; test tab.</p>
    </div>
  );
}
