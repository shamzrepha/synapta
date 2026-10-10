"use client";

import React, { useState } from "react";
import { useUserStore } from "@/lib/store/use-user-store";
import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MasteryRadar, RadarDataPoint } from "@/components/dashboard/mastery-radar";
import {
  BrainCircuit,
  Flame,
  Zap,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Activity,
  Users,
} from "lucide-react";
import Link from "next/link";
import { updateMastery } from "@/lib/bkt/engine";

export default function DashboardPage() {
  const { user, updateUser } = useUserStore();
  const { toast } = useToast();

  const [radarData, setRadarData] = useState<RadarDataPoint[]>([
    { subject: "Ohm's Law", fullName: "Ohm's Law & DC Resistor Networks", pL: 96, threshold: 95 },
    { subject: "RC Filters", fullName: "RC Low-Pass Filter Frequency Response", pL: 63, threshold: 95 },
    { subject: "Logic Gates", fullName: "Combinational Logic & Half Adders", pL: 34, threshold: 95 },
    { subject: "Kinematics", fullName: "Two-Dimensional Ballistic Trajectory", pL: 78, threshold: 95 },
    { subject: "Kirchhoff", fullName: "Kirchhoff's Voltage & Current Laws", pL: 88, threshold: 95 },
    { subject: "AC Impedance", fullName: "Capacitive & Inductive Reactance", pL: 52, threshold: 95 },
  ]);

  const [simulating, setSimulating] = useState(false);

  // Live BKT simulation evidence test
  const handleSimulateEvidence = async (subject: string, correct: boolean) => {
    setSimulating(true);
    const target = radarData.find((d) => d.subject === subject);
    if (!target) return;

    const currentPL = target.pL / 100;
    const newPL = updateMastery(
      currentPL,
      correct,
      { pT: 0.15, pG: 0.20, pS: 0.10 },
      "quiz"
    );
    const newPercentage = Math.round(newPL * 100);

    const xpGained = correct ? 10 : 1;
    if (user) {
      updateUser({ xp: user.xp + xpGained });
    }

    setRadarData((prev) =>
      prev.map((d) => (d.subject === subject ? { ...d, pL: newPercentage } : d))
    );

    toast({
      title: correct ? "Correct Answer! (+10 XP)" : "Incorrect Answer (+1 XP)",
      description: `${target.subject} Bayesian mastery updated from ${target.pL}% → ${newPercentage}%.`,
      variant: correct ? "success" : "destructive",
    });

    setSimulating(false);
  };

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
              Explore Courses
              <ArrowRight className="h-4 w-4 ml-1.5" />
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
            <p className="text-xs text-slate-500">Rank: Level 4 Intermediate Explorer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Mastered Concepts</CardDescription>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {radarData.filter((d) => d.pL >= 95).length} / {radarData.length}
              </span>
              <div className="h-9 w-9 rounded-xl bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                <BrainCircuit className="h-5 w-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Cross 95% to unlock advanced challenges</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Token Allowance</CardDescription>
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
            <p className="text-xs text-slate-500">Monthly AI quota resets in 20 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Mastery Radar & Interactive Twin Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MasteryRadar data={radarData} />
        </div>

        {/* Live BKT Evidence Simulator Card */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-base font-bold">Live BKT Evidence Simulator</h2>
            </div>
            <CardDescription className="text-xs">
              Simulate submitting quiz answers to observe posterior P(L) shifts on your radar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2">
              <span className="text-xs font-semibold block text-slate-700 dark:text-slate-300">
                Target Concept: Logic Gates (Current: {radarData.find((d) => d.subject === "Logic Gates")?.pL}%)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  onClick={() => handleSimulateEvidence("Logic Gates", true)}
                  disabled={simulating}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Answer Correct
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40 text-xs"
                  onClick={() => handleSimulateEvidence("Logic Gates", false)}
                  disabled={simulating}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Answer Incorrect
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2">
              <span className="text-xs font-semibold block text-slate-700 dark:text-slate-300">
                Target Concept: RC Filters (Current: {radarData.find((d) => d.subject === "RC Filters")?.pL}%)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  onClick={() => handleSimulateEvidence("RC Filters", true)}
                  disabled={simulating}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Answer Correct
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40 text-xs"
                  onClick={() => handleSimulateEvidence("RC Filters", false)}
                  disabled={simulating}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Answer Incorrect
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Peer Lounge Suggestion Banner if Struggling */}
      {radarData.some((d) => d.pL < 40) && (
        <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10">
          <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <Badge variant="amber" className="text-xs mb-2">Cognitive Twin Alert</Badge>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-500" /> Peer Study Lounge Recommended
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl">
                Your Cognitive Twin detects that your mastery on <strong>Combinational Logic & Half Adders</strong> is currently 34% (below the 40% threshold). We matched you with peers who have mastered this concept (&gt; 85%) for collaborative study!
              </p>
            </div>
            <Link href="/lounge">
              <Button variant="amber" size="default" className="shrink-0">
                Join Peer Study Lounge
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Continue Learning Recommendation Banner */}
      <Card className="border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/20">
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Badge variant="default" className="text-xs mb-2">Recommended Next Focus</Badge>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              RC Filter Cutoff Frequency & Phase Analysis
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Your Cognitive Twin estimates a mastery probability of P(L) = 63%. Solving the interactive frequency response lab will boost your posterior above 85%.
            </p>
          </div>
          <Link href="/classes/class-circuits-101">
            <Button size="default" className="shrink-0">
              Open Topic Lab
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
