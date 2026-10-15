"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Wrench, Send, Trophy, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import type { EventDetail } from "./types";
import { cn } from "@/lib/utils";

/**
 * Build challenge: everyone designs in Maker Studio against the same brief; the server simulates
 * each submitted design (gravity, gears, code tests) and ranks them. Entries open up after it ends.
 */
export function BuildChallengePanel({ detail, onChanged }: { detail: EventDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const ev = detail.event;
  const b = ev.build;
  if (!b) return null;

  const submit = async () => {
    setBusy(true);
    try {
      const j = await fetch(`/api/events/${ev.id}/submit-design`, { method: "POST" }).then((r) => r.json());
      if (j.ok) {
        toast({ title: j.data.valid ? `Scored ${j.data.score.toLocaleString()} points` : "Submitted — not passing yet", description: j.data.verdict, variant: j.data.valid ? "success" : "amber" });
        onChanged();
      } else toast({ title: "Couldn't submit", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-2">
        <p className="font-bold flex items-center gap-2">
          <Wrench className="h-5 w-5 text-indigo-500" /> The brief
        </p>
        {b.designKind === "mechanism" ? (
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>Lift <b>{b.loadMass ?? "the"} kg</b> by <b>{b.liftHeight ?? "the set"} m</b> as fast as possible.</li>
            {b.input && (
              <li>
                Input:{" "}
                {b.input.kind === "motor" ? (
                  <b>motor, {b.input.stallTorque} N·m stall, {b.input.freeRpm} rpm</b>
                ) : (
                  <b>hand crank, {b.input.force} N push on a {b.input.crankRadius} m handle</b>
                )}{" "}
                (fixed for everyone).
              </li>
            )}
            <li>Choose gear teeth, drum size and pulleys. Up to {b.maxStages} gear stages.</li>
            <li>Scored by a gravity simulation on the server: faster lift = more points. Can&apos;t lift = 0.</li>
          </ul>
        ) : (
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>Wire and program the circuit so it passes every judge test.</li>
            <li>Passing tests earns the points; a tidier build (fewer parts and wires) breaks ties.</li>
          </ul>
        )}
        <p className="text-xs text-slate-500">The AI tutor gives hints only (no answers), and the AI can&apos;t edit entries while the challenge is live.</p>
      </Card>

      {detail.joined && detail.me?.designId && (
        <Card className="p-5 space-y-3">
          <p className="font-bold">Your entry</p>
          {detail.me.verdict ? (
            <p className="text-sm">
              Last score: <b className="text-teal-600">{detail.me.score.toLocaleString()}</b> — {detail.me.verdict}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Not submitted yet. Build and test in Maker Studio, save a version, then submit it here.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/studio/${detail.me.designId}`}>
              <Button>
                <Wrench className="h-4 w-4 mr-1" /> Open my design
              </Button>
            </Link>
            {ev.status === "live" && (
              <Button variant="outline" onClick={submit} isLoading={busy}>
                <Send className="h-4 w-4 mr-1" /> {detail.me.submitted ? "Re-submit latest version" : "Submit for scoring"}
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <p className="font-bold text-sm">Leaderboard</p>
          {ev.status === "live" && <span className="ml-auto h-2 w-2 rounded-full bg-rose-500 animate-pulse" aria-label="live" />}
        </div>
        {detail.board.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No entries scored yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {detail.board.map((r) => (
              <li key={r.uid} className={cn("flex items-start gap-3 px-4 py-3", r.isMe && "bg-teal-500/10")}>
                <span className="w-6 text-center text-sm font-bold text-slate-500">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
                <Avatar name={r.displayName} photoURL={r.photoURL} seed={r.uid} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.isMe ? "You" : r.displayName}</p>
                  {r.verdict && <p className="text-[11px] text-slate-500">{r.verdict}</p>}
                  {r.designId && (
                    <Link href={`/studio/${r.designId}`} className="text-[11px] font-semibold text-teal-600 inline-flex items-center gap-1">
                      View design <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
                <span className="text-sm font-extrabold tabular-nums">{r.score.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
