"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, School, TrendingUp, Zap, PlusCircle, CheckCircle2, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sprout } from "@/components/bot/sprout";
import { useToast } from "@/components/ui/toast";
import { LEARNING_COHORTS, type LearningCohortId } from "@/lib/learning/telemetry";
import Link from "next/link";

interface UnservedDept {
  institution: string;
  department: string;
  level: string;
  students: number;
}

interface AutonomousDigestData {
  topCampuses: { institution: string; students: number }[];
  unservedDepartments: UnservedDept[];
  cohortCounts: Record<LearningCohortId, number>;
  paidSubscribers: number;
  estimatedGrossMarginPercent: number;
  cacheHitSavingsPercent: number;
}

export function AutonomousCeoDigest() {
  const { toast } = useToast();
  const [data, setData] = useState<AutonomousDigestData | null>(null);
  const [seedingKey, setSeedingKey] = useState<string | null>(null);
  const [seededClasses, setSeededClasses] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/autonomous")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) setData(j.data);
      })
      .catch(() => null);
  }, []);

  const handleAutoSeed = async (dept: UnservedDept) => {
    const key = `${dept.institution}::${dept.department}`;
    setSeedingKey(key);
    try {
      const res = await fetch("/api/admin/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution: dept.institution,
          department: dept.department,
          level: dept.level || "200L",
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Auto-seed failed",
          description: j?.error?.message || "Could not create starter course",
          variant: "destructive",
        });
        return;
      }
      setSeededClasses((prev) => ({ ...prev, [key]: j.data.classId }));
      toast({
        title: "Starter Course & Past Questions Seeded!",
        description: `${j.data.title} is now live with CBT & Theory questions.`,
        variant: "success",
      });
    } catch {
      toast({ title: "Network error", description: "Try again shortly", variant: "destructive" });
    } finally {
      setSeedingKey(null);
    }
  };

  if (!data) return null;

  return (
    <Card className="p-6 space-y-5 border-2 border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-card to-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-14 shrink-0 flex items-center justify-center">
            <Sprout pose="dance" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Semi-Autonomous CEO Digest
              </span>
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> {data.estimatedGrossMarginPercent}% Gross Margin
              </span>
            </div>
            <h3 className="text-base font-extrabold text-foreground mt-0.5">
              Autonomous Curriculum Seeder & Cohort Intelligence
            </h3>
            <p className="text-xs text-muted-foreground">
              Cohort pre-storage is saving ~{data.cacheHitSavingsPercent}% of repeat AI token calls across past questions.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: 1-Click Autonomous Departmental Course Pack Seeder */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <School className="h-3.5 w-3.5 text-brand-600" /> Auto-Seed Campus Departmental Packs
          </h4>
          <div className="space-y-2">
            {data.unservedDepartments.map((dept) => {
              const key = `${dept.institution}::${dept.department}`;
              const createdClassId = seededClasses[key];
              return (
                <div
                  key={key}
                  className="p-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">
                      {dept.department} ({dept.level})
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{dept.institution}</p>
                  </div>
                  {createdClassId ? (
                    <Link href={`/classes/${createdClassId}/past-questions`}>
                      <Button size="sm" variant="outline" className="h-8 text-xs text-emerald-600 font-bold shrink-0">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Open Pack
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      isLoading={seedingKey === key}
                      onClick={() => void handleAutoSeed(dept)}
                      className="h-8 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shrink-0"
                    >
                      <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Auto-Seed Pack
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Active FYP Learning Cohort Distribution */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-brand-600" /> Student FYP Learning Style Cohorts
          </h4>
          <div className="grid grid-cols-2 gap-2.5">
            {(Object.keys(LEARNING_COHORTS) as LearningCohortId[]).map((cid) => (
              <div key={cid} className="p-3 rounded-xl border border-border bg-card space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    {LEARNING_COHORTS[cid].shortLabel}
                  </span>
                  <span className="text-xs font-extrabold text-brand-600 flex items-center gap-0.5">
                    <Zap className="h-3 w-3 text-amber-500" />
                    {data.cohortCounts[cid] || 0}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {LEARNING_COHORTS[cid].description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
