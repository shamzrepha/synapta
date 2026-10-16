"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Compass,
  Lock,
  Unlock,
  CheckCircle2,
  Sparkles,
  BrainCircuit,
  ArrowRight,
  Calendar,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  List,
  Map as MapIcon,
  X,
  ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface MapNode {
  id: string;
  title: string;
  description: string;
  order: number;
  pL: number;
  rawPL: number;
  status: "locked" | "available" | "learning" | "mastered" | "due_review";
  hasLab: boolean;
  misconceptionCount: number;
  prerequisiteIds: string[];
}

interface MapEdge {
  id: string;
  source: string;
  target: string;
}

interface RecommendedStep {
  kcId: string;
  title: string;
  currentPL: number;
  isUnlocked: boolean;
  activity: string;
}

interface PacingData {
  weeksRemaining: number;
  daysRemaining: number;
  kcsRemaining: number;
  kcsPerWeekRequired: number;
  status: "on_track" | "behind" | "ahead";
  statusMessage: string;
}

interface TeacherNote {
  note: string;
  todayFocusKcId: string;
}

interface GoalData {
  targetDate: string;
  minutesPerDay: number;
  goalType: string;
}

export default function QuestMapPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [recommendedPath, setRecommendedPath] = useState<RecommendedStep[]>([]);
  const [pacing, setPacing] = useState<PacingData | null>(null);
  const [teacherNote, setTeacherNote] = useState<TeacherNote | null>(null);
  const [goal, setGoal] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list" | "proposals">("map");
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [targetDateInput, setTargetDateInput] = useState("");
  const [minutesInput, setMinutesInput] = useState("30");
  const [savingGoal, setSavingGoal] = useState(false);
  const [proposals, setProposals] = useState<Array<Record<string, unknown>>>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const reloadMap = useCallback(() => setReloadTick((t) => t + 1), []);

  const handleApplyProposal = async (proposalId: string, operationIds?: string[]) => {
    try {
      const res = await fetch(`/api/classes/${classId}/proposals/${proposalId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationIds }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Proposals Applied!",
          description: "Concept map updated with new topics and sources.",
          variant: "success",
        });
        reloadMap();
      }
    } catch {
      toast({ title: "Apply Error", description: "Failed to apply proposal.", variant: "destructive" });
    }
  };

  const handleDismissProposal = async (proposalId: string) => {
    try {
      const res = await fetch(`/api/classes/${classId}/proposals/${proposalId}/dismiss`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok) {
        toast({ title: "Proposal Dismissed", variant: "default" });
        reloadMap();
      }
    } catch {
      toast({ title: "Dismiss Error", description: "Failed to dismiss proposal.", variant: "destructive" });
    }
  };

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [mapRes, propRes] = await Promise.all([
          fetch(`/api/classes/${classId}/map`),
          fetch(`/api/classes/${classId}/proposals`),
        ]);
        const mapJson = await mapRes.json();
        const propJson = await propRes.json();

        if (!ignore) {
          if (mapJson.ok && mapJson.data) {
            setNodes(mapJson.data.nodes || []);
            setEdges(mapJson.data.edges || []);
            setRecommendedPath(mapJson.data.recommendedPath || []);
            setPacing(mapJson.data.pacing || null);
            setTeacherNote(mapJson.data.teacherNote || null);
            setGoal(mapJson.data.goal || null);
            if (mapJson.data.goal?.targetDate) {
              setTargetDateInput(mapJson.data.goal.targetDate);
            }
            if (mapJson.data.goal?.minutesPerDay) {
              setMinutesInput(String(mapJson.data.goal.minutesPerDay));
            }
          } else {
            toast({
              title: "Map Unavailable",
              description: mapJson.error?.message || "Could not load learning map.",
              variant: "destructive",
            });
          }

          if (propJson.ok && Array.isArray(propJson.data)) {
            setProposals(propJson.data);
          }
        }
      } catch {
        if (!ignore) {
          toast({
            title: "Connection Error",
            description: "Failed to connect to class map service.",
            variant: "destructive",
          });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
          setLoadingProposals(false);
        }
      }
    }

    init();
    return () => {
      ignore = true;
    };
  }, [classId, reloadTick, toast]);

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDateInput) return;
    setSavingGoal(true);
    try {
      const res = await fetch(`/api/classes/${classId}/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetDate: targetDateInput,
          minutesPerDay: parseInt(minutesInput) || 30,
          goalType: "master_course",
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Goal Updated!",
          description: "Your target date and pacing schedule have been updated.",
          variant: "success",
        });
        setGoalModalOpen(false);
        reloadMap();
      } else {
        toast({
          title: "Failed to save goal",
          description: json.error?.message || "Invalid date.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error saving goal",
        description: "Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setSavingGoal(false);
    }
  };

  const getStatusBadge = (status: MapNode["status"]) => {
    switch (status) {
      case "mastered":
        return <Badge variant="emerald" className="text-[10px]">Mastered</Badge>;
      case "learning":
        return <Badge variant="amber" className="text-[10px]">In Progress</Badge>;
      case "due_review":
        return <Badge variant="destructive" className="text-[10px]">Review Due</Badge>;
      case "available":
        return <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-500/40">Ready to Learn</Badge>;
      case "locked":
      default:
        return <Badge variant="secondary" className="text-[10px]">Locked</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Teacher Coach Note */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/classes/${classId}`}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
            >
              ← Back to Course Overview
            </Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1 flex items-center gap-2.5">
            <Compass className="h-7 w-7 text-teal-600 dark:text-teal-400" />
            Curriculum Quest Map
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Bayesian prerequisite graph. Concepts unlock sequentially as you demonstrate latent mastery.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-900">
            <button
              onClick={() => setViewMode("map")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                viewMode === "map"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Quest Map
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <List className="h-3.5 w-3.5" />
              List View
            </button>
            {proposals.length > 0 && (
              <button
                onClick={() => setViewMode("proposals")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  viewMode === "proposals"
                    ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm font-bold"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                Proposals ({proposals.filter((p) => p.status === "pending").length})
              </button>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setGoalModalOpen(true)}
            className="text-xs"
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
            {goal?.targetDate ? `Goal: ${goal.targetDate}` : "Set Target Date"}
          </Button>

          <Button size="sm" variant="ghost" onClick={reloadMap} className="text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Pacing & AI Teacher Note Card */}
      {teacherNote && (
        <Card className="border-teal-500/20 bg-teal-500/[0.03] dark:bg-teal-500/[0.05]">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider">
                    Today&apos;s Teacher Dispatch
                  </span>
                  {pacing && (
                    <Badge
                      variant={
                        pacing.status === "on_track"
                          ? "emerald"
                          : pacing.status === "ahead"
                          ? "default"
                          : "amber"
                      }
                      className="text-[10px]"
                    >
                      {pacing.status === "on_track"
                        ? "✓ On Track"
                        : pacing.status === "ahead"
                        ? "★ Ahead of Pace"
                        : "⚠️ Behind Pace"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  {teacherNote.note}
                </p>
              </div>
            </div>

            {pacing && (
              <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-2 md:pt-0 md:pl-4 shrink-0 text-xs text-slate-500">
                <span>
                  <strong>{pacing.kcsRemaining}</strong> topics remaining
                </span>
                <span>
                  ~<strong>{pacing.kcsPerWeekRequired}</strong>/week required
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Diagnostic Callout if applicable */}
      {nodes.length > 0 && nodes.every((n) => n.pL <= 20) && (
        <Card className="border-amber-500/30 bg-amber-500/[0.05]">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  New to this course? Take the Placement Diagnostic
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  10 quick questions will calibrate your Bayesian prior mastery and unlock concepts you already know.
                </p>
              </div>
            </div>
            <Link href={`/classes/${classId}/diagnostic`}>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                Start Diagnostic <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Main Interactive Map vs List Area */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      ) : viewMode === "map" ? (
        /* Visual Quest Map Graph */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 relative overflow-hidden min-h-[500px] flex flex-col justify-between">
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Mastered (≥95%)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> In Progress
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700 inline-block" /> Locked
              </span>
            </div>

            {/* Stepped Quest Nodes Rendering */}
            <div className="space-y-8 py-4 relative">
              {nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isFocus = teacherNote?.todayFocusKcId === node.id;

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer relative",
                      isSelected
                        ? "border-teal-500 shadow-md ring-2 ring-teal-500/20"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300",
                      node.status === "locked"
                        ? "bg-slate-50 dark:bg-slate-900/40 opacity-70"
                        : node.status === "mastered"
                        ? "bg-emerald-500/[0.04]"
                        : "bg-white dark:bg-slate-900"
                    )}
                  >
                    {isFocus && (
                      <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-teal-600 text-white text-[10px] font-bold tracking-wide flex items-center gap-1 shadow-sm">
                        <Zap className="h-3 w-3" /> Recommended Today
                      </span>
                    )}

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                            node.status === "mastered"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : node.status === "learning"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : node.status === "available"
                              ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                              : "bg-slate-200/50 dark:bg-slate-800 text-slate-400"
                          )}
                        >
                          {node.status === "mastered" ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : node.status === "locked" ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            `${node.order + 1}`
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                              {node.title}
                            </h3>
                            {getStatusBadge(node.status)}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {node.description}
                          </p>
                        </div>
                      </div>

                      {/* Right-side Mastery Indicator */}
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {node.pL}% P(L)
                        </div>
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              node.pL >= 95 ? "bg-emerald-500" : node.pL >= 40 ? "bg-amber-500" : "bg-teal-500"
                            )}
                            style={{ width: `${Math.min(100, Math.max(5, node.pL))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side Drawer: Selected Node Details & Launchpad */}
          <div>
            {selectedNode ? (
              <Card className="border-slate-200 dark:border-slate-800 sticky top-6">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Topic #{selectedNode.order + 1}
                    </span>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <CardTitle className="text-lg">{selectedNode.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {selectedNode.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Status & Mastery Bar */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        Bayesian Mastery Probability
                      </span>
                      <span className="font-bold text-teal-600 dark:text-teal-400">
                        {selectedNode.pL}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          selectedNode.pL >= 95
                            ? "bg-emerald-500"
                            : selectedNode.pL >= 40
                            ? "bg-amber-500"
                            : "bg-teal-500"
                        )}
                        style={{ width: `${selectedNode.pL}%` }}
                      />
                    </div>
                  </div>

                  {/* Open Misconceptions Warning */}
                  {selectedNode.misconceptionCount > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <strong>{selectedNode.misconceptionCount} Active Misconception(s)</strong>
                        <p className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-0.5">
                          Detected during diagnostic or practice. Review lesson or ask tutor to repair.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Action Navigation */}
                  <div className="space-y-2 pt-2">
                    <Link
                      href={`/classes/${classId}/topics/${selectedNode.id}?tab=lesson`}
                      className="w-full block"
                    >
                      <Button size="sm" className="w-full text-xs" variant="default">
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Study Lesson Material
                      </Button>
                    </Link>

                    <Link
                      href={`/classes/${classId}/topics/${selectedNode.id}?tab=practice`}
                      className="w-full block"
                    >
                      <Button size="sm" className="w-full text-xs" variant="outline">
                        <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                        Adaptive Practice Quiz
                      </Button>
                    </Link>

                    {selectedNode.hasLab && (
                      <Link
                        href={`/classes/${classId}/topics/${selectedNode.id}?tab=lab`}
                        className="w-full block"
                      >
                        <Button size="sm" className="w-full text-xs" variant="outline">
                          <Zap className="h-3.5 w-3.5 mr-1.5 text-indigo-500" />
                          Launch Simulation Lab
                        </Button>
                      </Link>
                    )}

                    <Link
                      href={`/classes/${classId}/topics/${selectedNode.id}?tab=tutor`}
                      className="w-full block"
                    >
                      <Button size="sm" className="w-full text-xs" variant="ghost">
                        <BrainCircuit className="h-3.5 w-3.5 mr-1.5 text-teal-600" />
                        Ask AI Socratic Tutor
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 space-y-2">
                <Compass className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p>Click any Knowledge Component on the map to view prerequisites, mastery status, and learning activities.</p>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === "list" ? (
        /* Accessible List View */
        <div className="space-y-3">
          {nodes.map((node) => (
            <Card key={node.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold text-xs">
                  {node.order + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {node.title}
                    </h4>
                    {getStatusBadge(node.status)}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1">{node.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-teal-600">{node.pL}% P(L)</span>
                <Link href={`/classes/${classId}/topics/${node.id}`}>
                  <Button size="sm" variant="outline" className="text-xs">
                    Open <ExternalLink className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Proposals Inbox View (A5) */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">AI Concept Map Proposals</h3>
              <p className="text-xs text-slate-500">
                Topic additions, merges, and source attachments derived from uploaded course documents.
              </p>
            </div>
            {proposals.some((p) => p.status === "pending") && (
              <Button
                size="sm"
                className="text-xs bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => {
                  const pendingProp = proposals.find((p) => p.status === "pending");
                  if (pendingProp) handleApplyProposal(pendingProp.id as string);
                }}
              >
                Apply All Safe Changes
              </Button>
            )}
          </div>

          {proposals.length === 0 ? (
            <Card className="p-8 text-center text-slate-500">
              No pending proposals for this class. Upload course materials in the class overview to generate topic proposals.
            </Card>
          ) : (
            <div className="space-y-4">
              {proposals.map((prop) => (
                <Card key={prop.id as string} className="p-4 space-y-3 border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-semibold text-xs text-slate-700 dark:text-slate-300">Proposal Ref: {prop.id as string}</span>
                    <Badge variant={prop.status === "applied" ? "emerald" : prop.status === "dismissed" ? "secondary" : "amber"}>
                      {prop.status as string}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {Array.isArray(prop.operations) &&
                      prop.operations.map((op: Record<string, unknown>, oIdx: number) => {
                        const newKc = op.newKcData as Record<string, unknown> | undefined;
                        return (
                          <div key={(op.id as string) || oIdx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                            <div className="flex items-center justify-between font-bold">
                              <span className="uppercase text-[10px] text-teal-600 dark:text-teal-400 tracking-wider">
                                {op.type as string}
                              </span>
                              <span className="text-slate-400 font-normal">
                                Confidence: {Math.round(((op.confidence as number) || 0.8) * 100)}%
                              </span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300">{op.rationale as string}</p>
                            {newKc && (
                              <div className="text-[11px] text-slate-500 mt-1">
                                Proposed Topic: <strong>{newKc.title as string}</strong> — {newKc.description as string}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {prop.status === "pending" && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleDismissProposal(prop.id as string)}>
                        Dismiss
                      </Button>
                      <Button size="sm" className="text-xs bg-teal-600 hover:bg-teal-700 text-white" onClick={() => handleApplyProposal(prop.id as string)}>
                        Apply to Course Map
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Goal Setting Modal */}
      {goalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white dark:bg-slate-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Set Target Learning Goal</CardTitle>
              <button onClick={() => setGoalModalOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <CardDescription className="text-xs">
              Tell the AI Teacher your exam or deadline date and daily capacity. The planner will re-calculate your pace.
            </CardDescription>

            <form onSubmit={handleSaveGoal} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Completion Date
                </label>
                <Input
                  type="date"
                  value={targetDateInput}
                  onChange={(e) => setTargetDateInput(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Daily Study Minutes
                </label>
                <Input
                  type="number"
                  min="10"
                  max="240"
                  value={minutesInput}
                  onChange={(e) => setMinutesInput(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGoalModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={savingGoal}>
                  {savingGoal ? "Saving..." : "Save Goal & Recalculate"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
