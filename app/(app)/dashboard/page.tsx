"use client";

import React, { useState, useEffect } from "react";
import { useUserStore } from "@/lib/store/use-user-store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MasteryRadar, RadarDataPoint } from "@/components/dashboard/mastery-radar";
import {
  BrainCircuit,
  Swords,
  BookOpen,
  ArrowRight,
  Compass,
  Users,
  GraduationCap,
} from "lucide-react";
import Link from "next/link";
import { asArray } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useGameState } from "@/components/game/use-game";
import { LevelCard, LeagueCard, QuestsCard } from "@/components/game/widgets";
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

  useEffect(() => {
    let ignore = false;
    async function loadDashboard() {
      try {
        const res = await fetch("/api/me/dashboard");
        const json = await res.json();
        if (!ignore && json.ok && json.data) {
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
        // network or offline
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      ignore = true;
    };
  }, [updateUser]);

  const sessionClasses = asArray(classes).map((c) => ({ id: c.id, title: c.title }));

  return (
    <div className="space-y-6">
      {/* Welcome & Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user?.displayName || "Learner"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {game
              ? game.quests.every((q) => q.done)
                ? "All daily quests done — legendary! Come back tomorrow for new ones."
                : `${game.quests.filter((q) => !q.done).length} daily quest${game.quests.filter((q) => !q.done).length === 1 ? "" : "s"} left today. Keep your 🔥 ${game.streakDays}-day streak alive!`
              : "Pick up where you left off."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/explore">
            <Button size="sm">
              <Compass className="h-4 w-4 mr-1.5" />
              Explore Courses
            </Button>
          </Link>
          <Link href="/friends">
            <Button size="sm" variant="outline">
              <Users className="h-4 w-4 mr-1.5" />
              Friends & Chat
            </Button>
          </Link>
        </div>
      </div>

      {/* Game loop: level, league, daily quests */}
      {game ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          <LevelCard game={game} />
          <LeagueCard game={game} />
          <div className="md:col-span-2 xl:col-span-1">
            <QuestsCard game={game} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      )}

      {/* What's happening: sessions + challenges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <SessionsPanel classes={sessionClasses} title="Study sessions" compact />
        <Card className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold flex items-center gap-2">
              <Swords className="h-4 w-4 text-rose-500" /> Challenges
            </p>
            <Link href="/challenges" className="text-xs font-semibold text-teal-600 dark:text-teal-400">
              See all
            </Link>
          </div>
          {activeEvents.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No live or upcoming challenges right now.</p>
          ) : (
            <ul className="space-y-2">
              {activeEvents.slice(0, 4).map((ev) => (
                <li key={ev.id}>
                  <Link
                    href={`/challenges/${ev.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 hover:border-teal-500/50"
                  >
                    <span className="text-xl">{ev.kind === "hackathon" ? "🛠️" : "⚡"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{ev.title}</p>
                      <p className="text-[11px] text-slate-500">{ev.participantCount} joined</p>
                    </div>
                    <span
                      className={
                        ev.status === "live"
                          ? "text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse"
                          : "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      }
                    >
                      {ev.status === "live" ? "LIVE" : ev.status === "voting" ? "VOTING" : "SOON"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : classes.length === 0 ? (
        /* Clean Zero-Data Onboarding State */
        <Card className="p-8 border-slate-200 dark:border-slate-800 text-center space-y-6">
          <div className="max-w-md mx-auto space-y-3">
            <div className="h-16 w-16 rounded-3xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto shadow-sm">
              <BrainCircuit className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Your Cognitive Journey Begins Here
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              You aren&apos;t enrolled in any classes yet. Join a course in the explore directory or connect with your teacher to activate your latent Bayesian Knowledge Tracing model.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto pt-2 text-left">
            <Link
              href="/explore"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500/50 hover:shadow-md transition-all group"
            >
              <div className="h-9 w-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Compass className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">1. Join a Class</h3>
              <p className="text-xs text-slate-500 mt-1">Browse courses with interactive simulation labs and syllabus trees.</p>
            </Link>

            <Link
              href="/friends"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500/50 hover:shadow-md transition-all group"
            >
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">2. Add Friends</h3>
              <p className="text-xs text-slate-500 mt-1">Search for peers by @username, connect, and direct message in real time.</p>
            </Link>

            <Link
              href="/notebook"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500/50 hover:shadow-md transition-all group"
            >
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <BookOpen className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">3. Notebook Studio</h3>
              <p className="text-xs text-slate-500 mt-1">Generate multi-speaker podcast discussions and study guides from your notes.</p>
            </Link>
          </div>
        </Card>
      ) : (
        /* Real Enrolled Classes Section */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Your Active Courses ({asArray(classes).length})
            </h2>
            <Link href="/explore">
              <Button size="sm" variant="ghost" className="text-xs">
                Browse More <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {asArray(classes).map((cls) => (
              <Card key={cls.id} className="flex flex-col justify-between hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px]">{cls.subject}</Badge>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Users className="h-3 w-3" /> {cls.studentCount || 0} students
                    </span>
                  </div>
                  <CardTitle className="text-base line-clamp-1">{cls.title}</CardTitle>
                  <CardDescription className="text-xs line-clamp-2 mt-1">
                    {cls.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Link href={`/classes/${cls.id}`}>
                    <Button size="sm" className="w-full text-xs">
                      Enter Course <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="pt-4">
            <MasteryRadar data={radarData} />
          </div>
        </div>
      )}
    </div>
  );
}
