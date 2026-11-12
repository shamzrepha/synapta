"use client";

import { AddMaterialStrip } from "@/components/home/add-material-strip";
import React, { useState, useEffect } from "react";
import { useUserStore } from "@/lib/store/use-user-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MasteryRadar, RadarDataPoint } from "@/components/dashboard/mastery-radar";
import { Swords, ArrowRight, Compass, Flame, GraduationCap } from "lucide-react";
import Link from "next/link";
import { BotLink } from "@/components/bot/bot-link";
import { asArray } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useGameState } from "@/components/game/use-game";
import { LevelCard, QuestsCard } from "@/components/game/widgets";
import { AchievementPrompts } from "@/components/feed/achievement-prompts";
import { HomeHero } from "@/components/home/home-hero";
import { summarizeProgress } from "@/lib/home/next-action";
import { SessionsPanel } from "@/components/sessions/sessions-panel";
import type { EventSummary } from "@/components/events/types";

interface EnrolledClass {
  id: string;
  title: string;
  subject: string;
  description: string;
  studentCount?: number;
  userEnrollmentStatus?: string;
  kcs?: { id: string; title: string }[];
}

export default function DashboardPage() {
  const { user, updateUser } = useUserStore();
  const { game } = useGameState();
  const [activeEvents, setActiveEvents] = useState<EventSummary[]>([]);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setActiveEvents((j.data.events as EventSummary[]).filter((e) => e.status !== "ended"));
      })
      .catch(() => null);
  }, []);
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [radarData, setRadarData] = useState<RadarDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function loadDashboard() {
      try {
        const res = await fetch("/api/me/dashboard");
        const json = await res.json();
        if (!ignore && !json.ok) setFailed(true);
        if (!ignore && json.ok && json.data) {
          setFailed(false);
          if (Array.isArray(json.data.classes)) {
            setClasses(json.data.classes);
          }
          if (Array.isArray(json.data.radarData)) {
            setRadarData(json.data.radarData);
          }
          if (json.data.profile) {
            updateUser(json.data.profile);
          }
        }
      } catch {
        // network or offline: say so instead of showing an empty "join a class" page
        if (!ignore) setFailed(true);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      ignore = true;
    };
  }, [updateUser, attempt]);

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const progress = summarizeProgress(asArray(radarData));
  const sessionClasses = asArray(classes).map((c) => ({ id: c.id, title: c.title }));

  const questsLeft = game ? game.quests.filter((q) => !q.done).length : 0;
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  return (
    <div className="space-y-8">
      {/* 1. Who and where you are: one calm line */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Today</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting}, {user?.displayName?.split(" ")[0] || "Learner"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {game
              ? questsLeft === 0
                ? "All of today's goals are done. Come back tomorrow for new ones."
                : `${questsLeft} goal${questsLeft === 1 ? "" : "s"} left today.`
              : "Pick up where you left off."}
          </p>
        </div>
        {game && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm" title="Days in a row you have studied">
              <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span className="font-mono font-medium">{game.streakDays}</span>
              <span className="text-xs text-muted-foreground">day streak</span>
            </span>
          </div>
        )}
      </header>

      {/* 2. What to do next */}
      <HomeHero
        role={user?.role}
        classes={asArray(classes).map((c) => ({ id: c.id, title: c.title }))}
        loading={loading}
        failed={failed}
        offline={offline}
        questsAllDone={!!game && game.quests.length > 0 && game.quests.every((q) => q.done)}
        progress={progress}
        onRetry={() => {
          setLoading(true);
          setAttempt((n) => n + 1);
        }}
      />

      {/* 3. Put something in */}
      <AddMaterialStrip />

      {/* 4. Today's goals */}
      <section aria-label="Today's goals" className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Today&apos;s goals</h2>
        {game ? (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            <QuestsCard game={game} />
            <LevelCard game={game} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        )}
      </section>

      {/* 5. Your classes, as a list you can scan */}
      {loading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : classes.length === 0 && failed ? null : (
        <section aria-label="Your classes" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Your classes{classes.length > 0 ? ` (${asArray(classes).length})` : ""}
            </h2>
            <Link href="/explore" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              Find a class <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {classes.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-dashed border-border p-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium">You haven&apos;t joined a class yet</p>
                <p className="text-sm text-muted-foreground">Search for your class, or use the code your teacher gave you. You can also study on your own with anything you upload.</p>
              </div>
              <Link href="/explore">
                <Button size="sm" className="shrink-0">
                  <Compass className="mr-1.5 h-4 w-4" /> Find a class
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {asArray(classes).map((cls) => (
                <li key={cls.id}>
                  <BotLink href={`/classes/${cls.id}`} label={cls.title} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/60">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                      <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{cls.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {cls.subject}
                        {cls.studentCount ? ` · ${cls.studentCount} students` : ""}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </BotLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {classes.length > 0 && <MasteryRadar data={radarData} />}

      {/* 6. What is happening around you */}
      <section aria-label="Happening now" className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Happening now</h2>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <SessionsPanel classes={sessionClasses} title="Study sessions" compact />
          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Swords className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Challenges
              </p>
              <Link href="/challenges" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                See all
              </Link>
            </div>
            {activeEvents.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No live or upcoming challenges right now.</p>
            ) : (
              <ul className="divide-y divide-border">
                {activeEvents.slice(0, 4).map((ev) => (
                  <li key={ev.id}>
                    <Link href={`/challenges/${ev.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{ev.title}</span>
                        <span className="block text-xs text-muted-foreground">{ev.participantCount} joined</span>
                      </span>
                      <span className={ev.status === "live" ? "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider bg-rose-600 text-white" : "rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"}>
                        {ev.status === "live" ? "Live" : ev.status === "voting" ? "Voting" : "Soon"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      <AchievementPrompts max={2} />
    </div>
  );
}
