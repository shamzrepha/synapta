"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RichInline } from "@/components/markdown/rich-inline";
import type { Activity } from "@/lib/worlds/activities";
import type { Beat } from "@/lib/worlds/design";
import { ActivityCard, type CardResult } from "./activity-card";
import { SessionRunner } from "./session-runner";

interface Props {
  worldId: string;
  nodeId: string;
  title: string;
  beats: Beat[];
  activities: Activity[];
  critical: string[];
  onExit: () => void;
}

/**
 * The lecture loop (spec 11): a short idea from the notes, then a question about it straight away (retrieval, not
 * rereading), repeated, a recap, then mixed practice. The student can skip to practice at any time.
 */
export function LessonPlayer({ worldId, nodeId, title, beats, activities, critical, onExit }: Props) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"beats" | "practice">(beats.length ? "beats" : "practice");
  const [checks, setChecks] = useState<CardResult[]>([]);
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);

  const answeredKus = new Set(checks.map((c) => c.kuId));
  const practice = useMemo(() => activities.filter((a) => !(a.kuIds.length === 1 && answeredKus.has(a.kuIds[0]) && a.template !== "ordering" && a.template !== "matching")).slice(0, 14), [activities, answeredKus]);

  if (phase === "practice") {
    return (
      <SessionRunner worldId={worldId} nodeId={nodeId} title={title} activities={practice.length ? practice : activities.slice(0, 10)} critical={critical} before={checks} onExit={onExit} finishLabel="Back to the map" />
    );
  }
  const beat = beats[i];
  const goNext = () => (i + 1 >= beats.length ? setPhase("practice") : setI(i + 1));
  const check = beat.kind === "check" ? byId.get(beat.checkActivityId ?? "") : undefined;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-3 px-3 py-3 max-w-xl w-full mx-auto">
        <button type="button" onClick={onExit} aria-label="Leave the lesson" className="h-10 w-10 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-5 w-5" /></button>
        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${((i + 1) / (beats.length + 1)) * 100}%` }} /></div>
        <button type="button" onClick={() => setPhase("practice")} className="text-xs text-muted-foreground underline">Skip to practice</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl w-full mx-auto px-4 pb-8 pt-2 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{title}</p>
          {beat.kind === "teach" && (
            <>
              <Card className="p-5 text-lg leading-relaxed"><RichInline text={beat.text} /></Card>
              <Button className="w-full h-12" onClick={goNext}>Got it</Button>
            </>
          )}
          {beat.kind === "recap" && (
            <>
              <Card className="p-5 space-y-2"><p className="font-semibold">Remember</p><div className="text-base leading-relaxed whitespace-pre-line"><RichInline text={beat.text} /></div></Card>
              <Button className="w-full h-12" onClick={goNext}>Start practice</Button>
            </>
          )}
          {beat.kind === "check" && (check ? (
            <ActivityCard key={beat.id} worldId={worldId} activity={check} critical={critical.includes(check.kuIds[0])} onAnswered={(r) => setChecks((c) => [...c, r])} onNext={goNext} />
          ) : (
            <Button className="w-full h-12" onClick={goNext}>Continue</Button>
          ))}
        </div>
      </div>
    </div>
  );
}
