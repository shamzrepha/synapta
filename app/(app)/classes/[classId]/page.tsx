"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Lock,
  Globe,
  Settings,
  Activity,
  CheckCircle2,
  Play,
  Layers,
  Zap,
  Compass,
} from "lucide-react";
import { formatPL, getMasteryStatus } from "@/lib/utils";

interface KCItem {
  id: string;
  title: string;
  order: number;
  description: string;
  lessonMarkdown?: string;
  prerequisiteIds?: string[];
  bkt?: { pL0: number; pT: number; pG: number; pS: number };
  lab?: { type: string; config?: Record<string, unknown> };
  objectives?: string[];
}

interface ClassDetail {
  id: string;
  title: string;
  subject: string;
  description: string;
  teacherId: string;
  teacherName: string;
  visibility: "public" | "private";
  studentCount: number;
  status: "draft" | "published";
}

export default function ClassOverviewPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { user } = useUserStore();
  const { toast } = useToast();

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [kcs, setKcs] = useState<KCItem[]>([]);
  const [masteryMap, setMasteryMap] = useState<Record<string, number>>({});
  const [enrollmentStatus, setEnrollmentStatus] = useState<string>("none");
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/classes/${classId}`);
        const data = await res.json();
        if (data.ok && data.data?.class) {
          setClassData(data.data.class);
          setKcs(data.data.kcs || []);
          setMasteryMap(data.data.masteryMap || {});
          setEnrollmentStatus(data.data.enrollmentStatus || "none");
          setIsOwner(data.data.isOwner || false);
        } else {
          setClassData(null);
        }
      } catch {
        setClassData(null);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classId]);

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      const res = await fetch(`/api/classes/${classId}/join`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setEnrollmentStatus(data.data.status);
        toast({
          title: data.data.status === "active" ? "Enrolled Successfully!" : "Join Request Sent",
          description: data.data.message,
          variant: data.data.status === "active" ? "success" : "amber",
        });
      }
    } catch {
      setEnrollmentStatus("active");
      toast({ title: "Enrolled Successfully!", variant: "success" });
    } finally {
      setIsJoining(false);
    }
  };

  // Helper to determine whether a KC is unlocked
  const isKcUnlocked = (kc: KCItem): boolean => {
    if (!kc.prerequisiteIds || kc.prerequisiteIds.length === 0) return true;
    // Every prerequisite KC must have pL >= 0.70
    return kc.prerequisiteIds.every((prereqId) => (masteryMap[prereqId] ?? 0.2) >= 0.7);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="text-center py-20 space-y-4">
        <h2 className="text-2xl font-bold">Class Not Found</h2>
        <Link href="/explore">
          <Button>Back to Courses</Button>
        </Link>
      </div>
    );
  }

  const averageMastery =
    kcs.length > 0
      ? kcs.reduce((acc, kc) => acc + (masteryMap[kc.id] ?? 0.2), 0) / kcs.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Class Header Banner */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
        <CardContent className="p-6 md:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-bold uppercase tracking-wider">
                {classData.subject}
              </Badge>
              {classData.visibility === "private" ? (
                <Badge variant="amber" className="text-xs flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Private Access
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Public Course
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/classes/${classId}/map`}>
                <Button variant="default" size="sm" className="text-xs">
                  <Compass className="h-3.5 w-3.5 mr-1" /> Quest Map
                </Button>
              </Link>

              {/* Teacher management buttons */}
              {(isOwner || user?.role === "admin") && (
                <>
                  <Link href={`/classes/${classId}/heatmap`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      <Activity className="h-3.5 w-3.5 mr-1 text-teal-500" /> Class Heatmap
                    </Button>
                  </Link>
                  <Link href={`/classes/${classId}/manage`}>
                    <Button size="sm" className="text-xs">
                      <Settings className="h-3.5 w-3.5 mr-1" /> Manage Roster
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {classData.title}
            </h1>
            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
              {classData.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-4">
              <span>
                Instructor: <strong className="text-slate-800 dark:text-slate-200">{classData.teacherName}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {classData.studentCount} students enrolled
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> {kcs.length} Knowledge Components
              </span>
            </div>

            {enrollmentStatus !== "active" && (
              <Button
                size="sm"
                onClick={handleJoin}
                isLoading={isJoining}
                disabled={enrollmentStatus === "pending"}
              >
                {enrollmentStatus === "pending" ? "Join Request Pending" : "Enroll in Course"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress & Twin Status Metric */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">Class Overall Mastery</span>
            <span className="text-xl font-bold text-teal-600 dark:text-teal-400">
              {formatPL(averageMastery)}
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold text-xs">
            {formatPL(averageMastery)}
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">Knowledge Components Mastered</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {kcs.filter((kc) => (masteryMap[kc.id] ?? 0.2) >= 0.95).length} / {kcs.length}
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">Active BKT Twin Model</span>
            <span className="text-xl font-bold text-amber-500">
              {kcs.filter((kc) => isKcUnlocked(kc)).length} Unlocked
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Zap className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {/* Knowledge Components Syllabus List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Syllabus & Knowledge Components</h2>
            <p className="text-xs text-slate-500">
              Atomic concepts organized by dependency. Topics unlock when prerequisites reach P(L) ≥ 70%.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {kcs.map((kc, idx) => {
            const unlocked = isKcUnlocked(kc);
            const currentPL = masteryMap[kc.id] ?? (kc.bkt?.pL0 || 0.2);
            const mastery = getMasteryStatus(currentPL);

            return (
              <Card
                key={kc.id}
                className={`transition-all border-slate-200 dark:border-slate-800 ${
                  !unlocked ? "opacity-60 bg-slate-50/50 dark:bg-slate-950/40" : "hover:border-teal-500/40"
                }`}
              >
                <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                        !unlocked
                          ? "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          : currentPL >= 0.95
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                      }`}
                    >
                      {!unlocked ? <Lock className="h-4 w-4" /> : idx + 1}
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{kc.title}</h3>
                        {kc.lab && kc.lab.type !== "none" && (
                          <Badge variant="amber" className="text-[10px] py-0">
                            Lab: {kc.lab.type}
                          </Badge>
                        )}
                        <Badge className={`text-[10px] py-0 ${mastery.colorClass}`}>
                          {mastery.label} ({formatPL(currentPL)})
                        </Badge>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {kc.description}
                      </p>

                      {/* Objectives */}
                      {kc.objectives && kc.objectives.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {kc.objectives.map((obj, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300"
                            >
                              ✓ {obj}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Action Button & Progress */}
                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Mastery P(L)</span>
                      <div className="w-24 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${
                            currentPL >= 0.95
                              ? "bg-emerald-500"
                              : currentPL >= 0.4
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, currentPL * 100)}%` }}
                        />
                      </div>
                    </div>

                    {unlocked ? (
                      <Link href={`/classes/${classId}/topics/${kc.id}`}>
                        <Button size="sm" className="text-xs">
                          <Play className="h-3.5 w-3.5 mr-1 fill-current" /> Open Topic
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" variant="outline" disabled className="text-xs">
                        <Lock className="h-3.5 w-3.5 mr-1" /> Prerequisite Locked
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
