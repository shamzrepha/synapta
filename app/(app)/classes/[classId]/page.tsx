"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  FileText,
  MessagesSquare,
  Crown,
  Swords,
} from "lucide-react";
import { SessionsPanel } from "@/components/sessions/sessions-panel";
import { ClassPlanCard } from "@/components/teacher/class-plan-card";
import type { ClassroomPlan } from "@/components/teacher/classroom-plan";
import { formatPL, getMasteryStatus } from "@/lib/utils";
import { MaterialsUploader } from "@/components/teacher/MaterialsUploader";

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
  status: "draft" | "published" | "archived";
  buildState?: "empty" | "drafting" | "ready" | "needs_review" | "failed" | "waiting_quota";
  buildStep?: string;
  buildPct?: number;
  buildError?: string | null;
  buildClarifications?: string[];
  resumeAt?: string;
  joinCode?: string;
  level?: string;
  durationWeeks?: number;
  recommendedPlan?: ClassroomPlan;
}

interface ClassPayload {
  class: ClassDetail;
  kcs: KCItem[];
  masteryMap?: Record<string, number>;
  attemptsMap?: Record<string, number>;
  enrollmentStatus?: string;
  role?: string;
  isOwner?: boolean;
}

async function fetchClassPayload(classId: string): Promise<ClassPayload | null> {
  try {
    const res = await fetch(`/api/classes/${classId}`);
    const data = await res.json();
    return data.ok && data.data?.class ? (data.data as ClassPayload) : null;
  } catch {
    return null;
  }
}

const BUILD_STEP_LABELS: Record<string, string> = {
  scoping: "Reading your course description and materials…",
  drafting_map: "Designing topics, prerequisites and learning objectives…",
  saving_topics: "Saving your curriculum…",
  completed: "Done",
};

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
  const [attemptsMap, setAttemptsMap] = useState<Record<string, number>>({});
  const [enrollmentStatus, setEnrollmentStatus] = useState<string>("none");
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);

  const applyClassPayload = useCallback((payload: ClassPayload | null, opts: { silent?: boolean } = {}) => {
    setLoading(false);
    if (!payload) {
      if (!opts.silent) setClassData(null);
      return null;
    }
    setClassData(payload.class);
    setKcs(payload.kcs || []);
    setMasteryMap(payload.masteryMap || {});
    setAttemptsMap(payload.attemptsMap || {});
    setEnrollmentStatus(payload.enrollmentStatus || "none");
    setIsOwner(!!payload.isOwner || payload.role === "owner" || payload.role === "admin");
    return payload.class;
  }, []);

  const loadData = useCallback(
    async (opts: { silent?: boolean } = {}) => applyClassPayload(await fetchClassPayload(classId), opts),
    [classId, applyClassPayload]
  );

  useEffect(() => {
    fetchClassPayload(classId).then((payload) => applyClassPayload(payload));
  }, [classId, applyClassPayload]);

  // While the AI is drafting the curriculum, refresh every few seconds so progress and topics appear live
  const buildState = classData?.buildState;
  useEffect(() => {
    if (buildState !== "drafting") return;
    const t = setInterval(async () => {
      const updated = await loadData({ silent: true });
      if (updated && updated.buildState !== "drafting") {
        if (updated.buildState === "ready" || updated.buildState === "needs_review") {
          toast({ title: "Curriculum ready", description: "Review the topics below, then publish when you're happy.", variant: "success" });
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [buildState, loadData, toast]);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/classes/${classId}/publish`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast({
          title: "Class Published!",
          description: `All topics are now live and visible to students.`,
          variant: "success",
        });
        setClassData((prev) => prev ? { ...prev, status: "published", buildState: "ready" } : prev);
      } else {
        toast({
          title: "Publish Failed",
          description: data.error?.message || "Could not publish class.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Publish Error", description: "Network error publishing class.", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleBuildWithAi = async () => {
    setIsBuilding(true);
    // Show progress immediately; the request below runs for the whole build
    setClassData((prev) => (prev ? { ...prev, buildState: "drafting", buildStep: "scoping", buildPct: 5, buildError: null } : prev));
    try {
      const res = await fetch(`/api/classes/${classId}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (data && !data.ok) {
        toast({
          title: "AI build didn't finish",
          description: data.error?.message || "Please try again.",
          variant: "destructive",
        });
      }
    } catch {
      // The build may still be running server-side; polling picks up the result
    } finally {
      setIsBuilding(false);
      loadData({ silent: true });
    }
  };

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
              {classData.status === "draft" ? (
                <Badge variant="amber" className="text-xs flex items-center gap-1">
                  Draft Mode
                </Badge>
              ) : (
                <Badge variant="emerald" className="text-xs flex items-center gap-1">
                  Published
                </Badge>
              )}
              {classData.visibility === "private" ? (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Private Access
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Public Course
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/classes/${classId}/map`}>
                <Button variant="default" size="sm" className="text-xs">
                  <Compass className="h-3.5 w-3.5 mr-1" /> Quest Map
                </Button>
              </Link>

              <Link href={`/classes/${classId}/assignments`}>
                <Button variant="outline" size="sm" className="text-xs">
                  <FileText className="h-3.5 w-3.5 mr-1 text-teal-600 dark:text-teal-400" /> Assignments
                </Button>
              </Link>

              {/* Teacher Studio management buttons */}
              {(isOwner || user?.role === "admin") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={handleBuildWithAi}
                    isLoading={isBuilding}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1 text-amber-500" /> Build with AI
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setShowMaterialModal(true)}
                  >
                    <Layers className="h-3.5 w-3.5 mr-1 text-indigo-500" /> Upload Material
                  </Button>

                  {classData.status === "draft" && (
                    <Button
                      size="sm"
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handlePublish}
                      isLoading={isPublishing}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Publish Class
                    </Button>
                  )}

                  <Link href={`/classes/${classId}/heatmap`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      <Activity className="h-3.5 w-3.5 mr-1 text-teal-500" /> Heatmap
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

          {classData.buildState === "drafting" && (isOwner || user?.role === "admin") && (
            <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-900 dark:text-teal-100 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-teal-600 animate-pulse" />
                <span>{BUILD_STEP_LABELS[classData.buildStep || "scoping"] || "Building your class…"}</span>
              </div>
              <div className="h-2 rounded-full bg-teal-500/20 overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-700"
                  style={{ width: `${Math.max(5, classData.buildPct ?? 10)}%` }}
                />
              </div>
              <p className="text-xs opacity-80">Usually under a minute. You can leave this page — the build keeps going.</p>
            </div>
          )}

          {classData.buildState === "failed" && (isOwner || user?.role === "admin") && (
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm">
              <span className="flex-1 min-w-0">
                <strong>The AI build didn&apos;t finish.</strong> {classData.buildError || "Please try again."}
              </span>
              <Button size="sm" onClick={handleBuildWithAi} isLoading={isBuilding}>
                <Zap className="h-3.5 w-3.5 mr-1" /> Retry build
              </Button>
            </div>
          )}

          {classData.buildState === "waiting_quota" && (isOwner || user?.role === "admin") && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm">
              <strong>AI daily limit reached.</strong> Your class build is saved and will resume automatically
              {classData.resumeAt ? ` after ${classData.resumeAt}` : " later"}. You can also add topics manually in the syllabus editor.
            </div>
          )}

          {classData.status === "draft" &&
            kcs.length > 0 &&
            classData.buildState !== "drafting" &&
            (isOwner || user?.role === "admin") && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  Your curriculum is drafted — {kcs.length} topics. Students can&apos;t see it until you publish.
                </p>
                {classData.buildClarifications && classData.buildClarifications.length > 0 && (
                  <ul className="text-xs list-disc list-inside text-emerald-900/80 dark:text-emerald-100/80 space-y-0.5">
                    {classData.buildClarifications.slice(0, 4).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
                <ol className="text-xs space-y-1 text-emerald-900/80 dark:text-emerald-100/80 list-decimal list-inside">
                  <li>Open any topic below to preview it — lessons and simulations are generated on first open.</li>
                  <li>Adjust topics in the syllabus editor or upload more material if something is missing.</li>
                  <li>Publish when you&apos;re happy.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handlePublish} isLoading={isPublishing}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Publish class
                  </Button>
                  <Link href={`/classes/${classId}/syllabus`}>
                    <Button size="sm" variant="outline">Edit syllabus</Button>
                  </Link>
                </div>
              </div>
            )}

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
              {classData.joinCode && (isOwner || user?.role === "admin") && (
                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-semibold">
                  Code: {classData.joinCode}
                </span>
              )}
            </div>

            {/* Ownership is implicit: owners and admins never see 'Enroll' */}
            {!isOwner && user?.role !== "admin" && enrollmentStatus !== "active" && (
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

      {/* Real Materials Uploader Modal */}
      <MaterialsUploader
        classId={classId}
        isOpen={showMaterialModal}
        onClose={() => setShowMaterialModal(false)}
        onSuccess={() => {
          loadData({ silent: true });
        }}
      />

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

      {(isOwner || user?.role === "admin") && (
        <ClassPlanCard
          classId={classId}
          initialPlan={classData.recommendedPlan || null}
          classInfo={{ title: classData.title, subject: classData.subject, description: classData.description, level: classData.level, durationWeeks: classData.durationWeeks }}
        />
      )}

      {/* Live class life: sessions, community, rankings */}
      {(isOwner || enrollmentStatus === "active") && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2">
            <SessionsPanel classId={classId} classes={[{ id: classId, title: classData.title }]} title="Class study sessions" compact />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <Link href={`/feed?class=${classId}`}>
              <Card className="p-4 hover:border-teal-500/50 transition-colors h-full">
                <MessagesSquare className="h-5 w-5 text-teal-600 mb-1.5" />
                <p className="font-semibold text-sm">Class feed</p>
                <p className="text-xs text-slate-500">Ask questions, share wins</p>
              </Card>
            </Link>
            <Link href={`/leaderboard?scope=class&classId=${classId}`}>
              <Card className="p-4 hover:border-amber-500/50 transition-colors h-full">
                <Crown className="h-5 w-5 text-amber-500 mb-1.5" />
                <p className="font-semibold text-sm">Class leaderboard</p>
                <p className="text-xs text-slate-500">This week&apos;s top learners</p>
              </Card>
            </Link>
            <Link href="/challenges" className="col-span-2 lg:col-span-1">
              <Card className="p-4 hover:border-rose-500/50 transition-colors h-full">
                <Swords className="h-5 w-5 text-rose-500 mb-1.5" />
                <p className="font-semibold text-sm">Challenges</p>
                <p className="text-xs text-slate-500">Quiz sprints & hackathons</p>
              </Card>
            </Link>
          </div>
        </div>
      )}

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
            const attempts = attemptsMap[kc.id] ?? 0;
            const currentPL = masteryMap[kc.id] ?? (kc.bkt?.pL0 || 0.2);
            const mastery = getMasteryStatus(currentPL, attempts);

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
                          {mastery.label} {attempts > 0 ? `(${formatPL(currentPL)})` : "(Prior Baseline)"}
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
                            attempts === 0
                              ? "bg-slate-300 dark:bg-slate-700"
                              : currentPL >= 0.95
                              ? "bg-emerald-500"
                              : currentPL >= 0.4
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${attempts === 0 ? 0 : Math.min(100, currentPL * 100)}%` }}
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
