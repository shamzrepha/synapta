"use client";

import React, { useState, useEffect } from "react";
import { useUserStore } from "@/lib/store/use-user-store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MasteryRadar, RadarDataPoint } from "@/components/dashboard/mastery-radar";
import {
  BrainCircuit,
  Flame,
  Zap,
  BookOpen,
  ArrowRight,
  Compass,
  Users,
  GraduationCap,
} from "lucide-react";
import Link from "next/link";

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
  const { user } = useUserStore();
  const [classes, setClasses] = useState<EnrolledClass[]>([]);

  useEffect(() => {
    let ignore = false;
    async function loadMine() {
      try {
        const res = await fetch("/api/classes?scope=mine");
        const json = await res.json();
        if (!ignore && json.ok && Array.isArray(json.data?.classes)) {
          setClasses(json.data.classes);
        }
      } catch {
        // network or offline
      }
    }

    loadMine();
    return () => {
      ignore = true;
    };
  }, []);

  // Build radar data from real classes if knowledge components exist
  const radarData: RadarDataPoint[] = classes.flatMap((c) =>
    (c.kcs || []).map((kc) => ({
      subject: kc.title.length > 18 ? `${kc.title.slice(0, 15)}...` : kc.title,
      fullName: kc.title,
      pL: 20, // default baseline prior
      threshold: 95,
    }))
  ).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Welcome & Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user?.displayName || "Learner"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Your Cognitive Digital Twin is active. Latent state updated continuously via Bayesian Knowledge Tracing.
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

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Active Streak</CardDescription>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-amber-500">{user?.streakDays || 1} Days</span>
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Flame className="h-5 w-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Study today to keep your streak burning!</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Total XP Earned</CardDescription>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {user?.xp || 0} XP
              </span>
              <div className="h-9 w-9 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-500">
                <Zap className="h-5 w-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Solve interactive labs and quizzes to earn XP</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Enrolled Courses</CardDescription>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {classes.length}
              </span>
              <div className="h-9 w-9 rounded-xl bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                <GraduationCap className="h-5 w-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Active learning curriculums</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">AI Assistant Quota</CardDescription>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {((user?.monthlyTokensUsed || 0) / 1000).toFixed(1)}k / {((user?.monthlyTokenLimit || 50000) / 1000).toFixed(0)}k
              </span>
              <div className="h-9 w-9 rounded-xl bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Monthly Socratic tutor tokens</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      {classes.length === 0 ? (
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
              Your Active Courses ({classes.length})
            </h2>
            <Link href="/explore">
              <Button size="sm" variant="ghost" className="text-xs">
                Browse More <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
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

          {radarData.length > 0 && (
            <div className="pt-4">
              <MasteryRadar data={radarData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
