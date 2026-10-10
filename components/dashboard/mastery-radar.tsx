"use client";

import React from "react";
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
import { BrainCircuit, CheckCircle2, AlertTriangle } from "lucide-react";

export interface RadarDataPoint {
  subject: string;
  fullName: string;
  pL: number; // 0 to 100
  threshold: number; // 95 for mastery
}

interface MasteryRadarProps {
  data?: RadarDataPoint[];
}

const defaultRadarData: RadarDataPoint[] = [
  { subject: "Ohm's Law", fullName: "Ohm's Law & DC Resistor Networks", pL: 96, threshold: 95 },
  { subject: "RC Filters", fullName: "RC Low-Pass Filter Frequency Response", pL: 63, threshold: 95 },
  { subject: "Logic Gates", fullName: "Combinational Logic & Half Adders", pL: 34, threshold: 95 },
  { subject: "Kinematics", fullName: "Two-Dimensional Ballistic Trajectory", pL: 78, threshold: 95 },
  { subject: "Kirchhoff", fullName: "Kirchhoff's Voltage & Current Laws", pL: 88, threshold: 95 },
  { subject: "AC Impedance", fullName: "Capacitive & Inductive Reactance", pL: 52, threshold: 95 },
];

export function MasteryRadar({ data = defaultRadarData }: MasteryRadarProps) {
  const masteredCount = data.filter((d) => d.pL >= 95).length;
  const learningCount = data.filter((d) => d.pL >= 40 && d.pL < 95).length;
  const strugglingCount = data.filter((d) => d.pL < 40).length;

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Cognitive Twin Mastery Radar</CardTitle>
              <CardDescription className="text-xs">
                Real-time latent mastery probability P(L) mapped across Knowledge Components
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant="emerald" className="text-[10px]">
              {masteredCount} Mastered
            </Badge>
            <Badge variant="amber" className="text-[10px]">
              {learningCount} Learning
            </Badge>
            {strugglingCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {strugglingCount} Struggling
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
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
                        <p className="text-teal-600 dark:text-teal-400 font-semibold">
                          Mastery P(L): {item.pL.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {item.pL >= 95
                            ? "✓ Mastered (P(L) ≥ 95%)"
                            : item.pL >= 40
                            ? "In progress (Practicing)"
                            : "⚠️ Needs reinforcement"}
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
