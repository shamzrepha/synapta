"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, CheckCircle2, AlertTriangle, Sparkles, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RadarDataPoint {
  id?: string;
  classId?: string;
  subject: string;
  fullName: string;
  pL: number; // 0 to 100
  threshold: number; // 95 for mastery
}

interface MasteryRadarProps {
  data?: RadarDataPoint[];
  title?: string;
  subtitle?: string;
}

export function MasteryRadar({
  data = [],
  title = "Cognitive Twin Mastery Radar",
  subtitle = "Real-time latent mastery probability P(L) mapped across all topics & Knowledge Components",
}: MasteryRadarProps) {
  const [filter, setFilter] = useState<"all" | "mastered" | "learning" | "struggling">("all");

  if (!data || data.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">{title}</CardTitle>
              <CardDescription className="text-xs">{subtitle}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 pb-8">
          <div className="flex flex-col items-center justify-center text-center space-y-3 p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800">
            <div className="h-12 w-12 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No Knowledge Components Tracked Yet
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Enroll in a course and complete interactive quizzes, labs, or peer explanations to begin calibrating your Bayesian Cognitive Twin radar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const masteredCount = data.filter((d) => d.pL >= 95).length;
  const learningCount = data.filter((d) => d.pL >= 40 && d.pL < 95).length;
  const strugglingCount = data.filter((d) => d.pL < 40).length;
  const avgPL = Math.round(data.reduce((acc, d) => acc + d.pL, 0) / data.length);

  const filteredTopics = data.filter((d) => {
    if (filter === "mastered") return d.pL >= 95;
    if (filter === "learning") return d.pL >= 40 && d.pL < 95;
    if (filter === "struggling") return d.pL < 40;
    return true;
  });

  // For the polygon visual, show up to 14 evenly-spaced topics so labels never overlap, while the breakdown below shows 100% of all topics
  const chartData =
    data.length <= 14
      ? data
      : Array.from({ length: 14 }, (_, i) => data[Math.floor((i * data.length) / 14)]);

  return (
    <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  {data.length} Topics • {avgPL}% Avg P(L)
                </span>
              </CardTitle>
              <CardDescription className="text-xs">{subtitle}</CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="emerald" className="text-[10px]">
              {masteredCount} Mastered
            </Badge>
            <Badge variant="amber" className="text-[10px]">
              {learningCount} Learning
            </Badge>
            <Badge variant="destructive" className="text-[10px]">
              {strugglingCount} Needs Focus
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2 space-y-4">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
              <PolarGrid stroke="#94A3B8" strokeOpacity={0.2} />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: "#64748B", fontSize: 11, fontWeight: 500 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                stroke="#94A3B8"
                strokeOpacity={0.2}
                tick={{ fill: "#94A3B8", fontSize: 9 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as RadarDataPoint;
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900 text-xs space-y-1">
                        <p className="font-bold text-slate-900 dark:text-slate-100">{item.fullName}</p>
                        <p className="text-brand-600 dark:text-brand-400 font-semibold">
                          Mastery P(L): {item.pL.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {item.pL >= 95
                            ? "Mastered (P(L) >= 95%)"
                            : item.pL >= 40
                            ? "In progress (Practicing)"
                            : "Needs reinforcement"}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Radar
                name="Mastery P(L)"
                dataKey="pL"
                stroke="#14B8A6"
                strokeWidth={2}
                fill="#14B8A6"
                fillOpacity={0.35}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* All Topics Live Breakdown */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" /> All Topics Mastery Stats ({filteredTopics.length} of {data.length})
            </p>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-slate-100/70 dark:bg-slate-900 text-[11px] font-semibold">
              {(
                [
                  ["all", `All (${data.length})`],
                  ["mastered", `Mastered (${masteredCount})`],
                  ["learning", `Learning (${learningCount})`],
                  ["struggling", `Focus (${strugglingCount})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "px-2 py-1 rounded-md transition",
                    filter === id ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {filteredTopics.map((item, idx) => {
              const tone =
                item.pL >= 95
                  ? "bg-emerald-500"
                  : item.pL >= 40
                  ? "bg-amber-500"
                  : "bg-rose-500";
              const badgeTone =
                item.pL >= 95
                  ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15"
                  : item.pL >= 40
                  ? "text-amber-700 dark:text-amber-300 bg-amber-500/15"
                  : "text-rose-700 dark:text-rose-300 bg-rose-500/15";
              const href =
                item.classId && item.id ? `/classes/${item.classId}/topics/${item.id}` : null;

              const inner = (
                <div className="rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 p-2.5 space-y-1.5 hover:border-brand-500/50 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
                      <span className="text-[10px] font-mono text-muted-foreground">{idx + 1}.</span>
                      <span className="truncate">{item.fullName}</span>
                    </span>
                    <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5", badgeTone)}>
                      {item.pL}%
                      {href && <ArrowUpRight className="h-2.5 w-2.5" />}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-300", tone)}
                      style={{ width: `${Math.max(4, Math.min(100, item.pL))}%` }}
                    />
                  </div>
                </div>
              );

              return href ? (
                <Link key={`${item.id || item.fullName}-${idx}`} href={href}>
                  {inner}
                </Link>
              ) : (
                <div key={`${item.id || item.fullName}-${idx}`}>{inner}</div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Mastery Target: 95%
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Socratic threshold: &lt; 40%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
