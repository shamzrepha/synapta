"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Sparkles,
  ArrowLeft,
  FlaskConical,
  BookOpen,
  CheckCircle2,
  Clock,
  Printer,
  Trash2,
  Eye,
  AlertCircle,
  Cpu,
  Layers,
  X,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KcOption {
  id: string;
  title: string;
}

interface AssignmentItem {
  id: string;
  title: string;
  kind: "theory" | "practical";
  targetKcIds: string[];
  difficulty: "introductory" | "intermediate" | "advanced" | "olympiad";
  estimatedMinutes: number;
  overview: string;
  theoryQuestions?: Array<{
    id: string;
    number: number;
    type: string;
    question: string;
    scenarioContext?: string;
    marks: number;
    rubric: Array<{ criterion: string; points: number; description: string }>;
    exemplarAnswer: string;
    distractorMisconceptions?: string[];
  }>;
  practicalExperiment?: {
    objective: string;
    variables: {
      independent: string;
      dependent: string;
      controlled: string[];
    };
    apparatus: Array<{ item: string; specification: string }>;
    procedure: Array<{ stepNumber: number; instruction: string; safetyOrTip?: string }>;
    dataCollectionTable: {
      columns: string[];
      sampleRowHint: string;
    };
    analysisQuestions: Array<{ question: string; marks: number; guide: string }>;
    totalMarks: number;
  };
  teacherNotes: string;
  status: "draft" | "published";
  createdAt?: string;
}

export default function ClassAssignmentsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [kcs, setKcs] = useState<KcOption[]>([]);
  const [classTitle, setClassTitle] = useState("Course");
  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filter
  const [filterKind, setFilterKind] = useState<"all" | "theory" | "practical">("all");

  // Modal State: Generate
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [genKind, setGenKind] = useState<"theory" | "practical">("theory");
  const [selectedKcIds, setSelectedKcIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<"introductory" | "intermediate" | "advanced" | "olympiad">("intermediate");
  const [numItems, setNumItems] = useState(4);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [agentStep, setAgentStep] = useState<string>("");

  // Modal State: Preview
  const [previewItem, setPreviewItem] = useState<AssignmentItem | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        const [classRes, assignRes] = await Promise.all([
          fetch(`/api/classes/${classId}`),
          fetch(`/api/classes/${classId}/assignments`),
        ]);

        const classJson = await classRes.json();
        const assignJson = await assignRes.json();

        if (!ignore && classJson.ok) {
          setClassTitle(classJson.data.class?.title || "Course");
          if (Array.isArray(classJson.data.kcs)) {
            setKcs(classJson.data.kcs.map((k: any) => ({ id: k.id, title: k.title })));
            if (classJson.data.kcs.length > 0) {
              setSelectedKcIds([classJson.data.kcs[0].id]);
            }
          }
        }

        if (!ignore && assignJson.ok) {
          setAssignments(assignJson.data.assignments || []);
          setIsTeacher(assignJson.data.isTeacher || false);
        }
      } catch {
        // network error handled
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [classId]);

  const handleRunGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedKcIds.length === 0) {
      toast({ title: "Select Topic", description: "Please pick at least one topic for this assignment.", variant: "amber" });
      return;
    }

    setGenerating(true);
    setAgentStep("Architect scoping cognitive objectives...");

    try {
      setTimeout(() => setAgentStep("Author drafting scenario problems & rubrics..."), 2000);
      setTimeout(() => setAgentStep("Reviewer verifying math, formulas & criteria..."), 5000);

      const res = await fetch(`/api/classes/${classId}/assignments/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: genKind,
          selectedKcIds,
          difficulty,
          numItems,
          specialInstructions: specialInstructions.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.ok && json.data?.assignment) {
        toast({
          title: "Assignment Generated!",
          description: `Created "${json.data.assignment.title}" in draft status.`,
          variant: "success",
        });
        setAssignments((prev) => [json.data.assignment, ...prev]);
        setIsGenerateOpen(false);
        setPreviewItem(json.data.assignment);
      } else {
        toast({
          title: "Generation Notice",
          description: json.error?.message || "Failed to generate assignment.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to connect to multi-agent pipeline.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
      setAgentStep("");
    }
  };

  const handleTogglePublish = async (item: AssignmentItem) => {
    const newStatus = item.status === "published" ? "draft" : "published";
    try {
      const res = await fetch(`/api/classes/${classId}/assignments/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setAssignments((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, status: newStatus } : a))
        );
        toast({
          title: newStatus === "published" ? "Assignment Published" : "Moved to Draft",
          description: newStatus === "published" ? "Students can now view this assignment." : "Hidden from students.",
          variant: "success",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleDelete = async (item: AssignmentItem) => {
    if (!confirm(`Are you sure you want to delete "${item.title}"?`)) return;
    try {
      const res = await fetch(`/api/classes/${classId}/assignments/${item.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        setAssignments((prev) => prev.filter((a) => a.id !== item.id));
        toast({ title: "Deleted", description: "Assignment removed." });
        if (previewItem?.id === item.id) setPreviewItem(null);
      }
    } catch {
      toast({ title: "Error", description: "Could not delete assignment.", variant: "destructive" });
    }
  };

  const filtered = assignments.filter((a) => {
    if (filterKind === "all") return true;
    return a.kind === filterKind;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href={`/classes/${classId}`}
            className="inline-flex items-center text-xs text-slate-500 hover:text-teal-600 mb-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to {classTitle}
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="h-7 w-7 text-teal-600 dark:text-teal-400" />
            Course Assignments
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Theory problem sets, laboratory investigations, and automated grading rubrics.
          </p>
        </div>

        {isTeacher && (
          <Button onClick={() => setIsGenerateOpen(true)} className="shadow-md">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Generate with Multi-Agent AI
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit">
        <button
          onClick={() => setFilterKind("all")}
          className={cn(
            "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
            filterKind === "all"
              ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
          )}
        >
          All ({assignments.length})
        </button>
        <button
          onClick={() => setFilterKind("theory")}
          className={cn(
            "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
            filterKind === "theory"
              ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Theory ({assignments.filter((a) => a.kind === "theory").length})
        </button>
        <button
          onClick={() => setFilterKind("practical")}
          className={cn(
            "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
            filterKind === "practical"
              ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
          )}
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Practical ({assignments.filter((a) => a.kind === "practical").length})
        </button>
      </div>

      {/* Assignments Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
              No assignments available yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {isTeacher
                ? "Click 'Generate with Multi-Agent AI' to craft theory problem sets or laboratory investigation protocols."
                : "Your teacher has not published any assignments for this course yet."}
            </p>
          </div>
          {isTeacher && (
            <Button size="sm" onClick={() => setIsGenerateOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Create First Assignment
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="flex flex-col justify-between border-slate-200 dark:border-slate-800 hover:border-teal-500/40 transition-all shadow-sm"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge
                    variant={item.kind === "theory" ? "outline" : "secondary"}
                    className="text-[10px] uppercase font-bold flex items-center gap-1"
                  >
                    {item.kind === "theory" ? (
                      <>
                        <BookOpen className="h-3 w-3" /> Theory
                      </>
                    ) : (
                      <>
                        <FlaskConical className="h-3 w-3 text-amber-500" /> Practical Lab
                      </>
                    )}
                  </Badge>

                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {item.difficulty}
                    </Badge>
                    {isTeacher && (
                      <Badge
                        variant={item.status === "published" ? "emerald" : "amber"}
                        className="text-[10px] capitalize"
                      >
                        {item.status}
                      </Badge>
                    )}
                  </div>
                </div>

                <CardTitle className="text-base font-bold line-clamp-1">{item.title}</CardTitle>
                <CardDescription className="text-xs line-clamp-2 mt-1">
                  {item.overview}
                </CardDescription>
              </CardHeader>

              <CardContent className="pb-3 text-xs text-slate-500 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Estimated Duration
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    ~{item.estimatedMinutes} mins
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> Content Items
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {item.kind === "theory"
                      ? `${item.theoryQuestions?.length || 0} Questions`
                      : `${item.practicalExperiment?.procedure.length || 0} Steps`}
                  </span>
                </div>
              </CardContent>

              <CardFooter className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewItem(item)}
                  className="flex-1 text-xs"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" /> View & Rubric
                </Button>

                {isTeacher && (
                  <>
                    <Button
                      size="sm"
                      variant={item.status === "published" ? "ghost" : "default"}
                      onClick={() => handleTogglePublish(item)}
                      className="text-xs"
                    >
                      {item.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(item)}
                      className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 px-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* GENERATE MODAL */}
      {isGenerateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <Card className="w-full max-w-lg border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-teal-600" />
                  Multi-Agent Assignment Generator
                </CardTitle>
                <button
                  onClick={() => !generating && setIsGenerateOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                  disabled={generating}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <CardDescription className="text-xs">
                Orchestrates Curriculum Architect, Pedagogical Author, and Verification agents.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleRunGenerate} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Kind Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Assignment Modality
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGenKind("theory")}
                    className={cn(
                      "p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all",
                      genKind === "theory"
                        ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 ring-2 ring-teal-500/30"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                    )}
                  >
                    <BookOpen className="h-5 w-5 text-teal-600" />
                    <div>
                      <p className="text-xs font-bold">Theory</p>
                      <p className="text-[10px] text-slate-500">Conceptual & derivations</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGenKind("practical")}
                    className={cn(
                      "p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all",
                      genKind === "practical"
                        ? "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                    )}
                  >
                    <FlaskConical className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="text-xs font-bold">Practical</p>
                      <p className="text-[10px] text-slate-500">Lab protocol & data table</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Target KCs */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Knowledge Components
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                  {kcs.map((kc) => {
                    const isSelected = selectedKcIds.includes(kc.id);
                    return (
                      <label
                        key={kc.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedKcIds((prev) => [...prev, kc.id]);
                            } else {
                              setSelectedKcIds((prev) => prev.filter((id) => id !== kc.id));
                            }
                          }}
                          className="rounded text-teal-600 focus:ring-teal-500"
                        />
                        <span className="truncate">{kc.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Difficulty & Items */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Difficulty Level
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs px-2.5"
                  >
                    <option value="introductory">Introductory</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="olympiad">Olympiad / Challenge</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {genKind === "theory" ? "Number of Questions" : "Lab Complexity Steps"}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={numItems}
                    onChange={(e) => setNumItems(parseInt(e.target.value) || 4)}
                    className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs px-2.5"
                  />
                </div>
              </div>

              {/* Special Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Custom Instructions (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Include real-world aerospace scenario, emphasize error analysis"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Multi-Agent Live Step Display */}
              {generating && (
                <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-800 dark:text-teal-200">
                    <Cpu className="h-4 w-4 animate-spin text-teal-600" />
                    <span>Multi-Agent Engine Running...</span>
                  </div>
                  <p className="text-[11px] text-teal-700 dark:text-teal-300">{agentStep}</p>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generating}
                  onClick={() => setIsGenerateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={generating}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Run Agents & Generate
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* PREVIEW & RUBRIC MODAL */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <Card className="w-full max-w-3xl border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={previewItem.kind === "theory" ? "outline" : "secondary"} className="text-[10px] uppercase">
                      {previewItem.kind}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {previewItem.difficulty}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold">{previewItem.title}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="p-2 rounded-lg border text-slate-500 hover:text-slate-900"
                    title="Print / Save PDF"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPreviewItem(null)}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700 dark:text-slate-300">
              {/* Overview */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border space-y-1">
                <h4 className="font-bold text-slate-900 dark:text-white">Student Overview</h4>
                <p>{previewItem.overview}</p>
              </div>

              {/* Theory Content */}
              {previewItem.kind === "theory" && previewItem.theoryQuestions && (
                <div className="space-y-6">
                  {previewItem.theoryQuestions.map((q) => (
                    <div key={q.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-teal-700 dark:text-teal-300">
                          Question {q.number} ({q.marks} Marks)
                        </span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {q.type.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      {q.scenarioContext && (
                        <p className="italic text-slate-500 dark:text-slate-400">{q.scenarioContext}</p>
                      )}

                      <p className="font-semibold text-slate-900 dark:text-white leading-relaxed">
                        {q.question}
                      </p>

                      {/* Rubric */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                        <h5 className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
                          Grading Rubric Breakdown:
                        </h5>
                        <ul className="space-y-1">
                          {q.rubric.map((r, i) => (
                            <li key={i} className="flex items-start justify-between gap-4 text-[11px]">
                              <span>• {r.criterion}: <span className="opacity-80">{r.description}</span></span>
                              <span className="font-bold text-teal-600 shrink-0">+{r.points} pts</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Exemplar Solution */}
                      <div className="pt-2 p-3 rounded-xl bg-teal-500/10 text-teal-900 dark:text-teal-200 space-y-1">
                        <h5 className="font-bold text-[11px] uppercase tracking-wider text-teal-700 dark:text-teal-300">
                          Model Exemplar Answer:
                        </h5>
                        <p className="font-mono text-[11px] whitespace-pre-wrap">{q.exemplarAnswer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Practical Content */}
              {previewItem.kind === "practical" && previewItem.practicalExperiment && (
                <div className="space-y-6">
                  {/* Objective & Variables */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="font-bold text-sm text-amber-600">Investigation Objective</h4>
                    <p>{previewItem.practicalExperiment.objective}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t text-[11px]">
                      <div>
                        <span className="font-bold block">Independent Variable:</span>
                        <span>{previewItem.practicalExperiment.variables.independent}</span>
                      </div>
                      <div>
                        <span className="font-bold block">Dependent Variable:</span>
                        <span>{previewItem.practicalExperiment.variables.dependent}</span>
                      </div>
                      <div>
                        <span className="font-bold block">Controlled Variables:</span>
                        <span>{previewItem.practicalExperiment.variables.controlled.join(", ")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Apparatus */}
                  <div className="p-4 rounded-2xl border space-y-2">
                    <h4 className="font-bold text-sm">Required Apparatus & Equipment</h4>
                    <ul className="grid grid-cols-2 gap-2 text-[11px]">
                      {previewItem.practicalExperiment.apparatus.map((app, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                          <span><strong>{app.item}</strong> ({app.specification})</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Procedure */}
                  <div className="p-4 rounded-2xl border space-y-3">
                    <h4 className="font-bold text-sm">Experimental Procedure</h4>
                    <ol className="space-y-2 list-decimal list-inside text-xs">
                      {previewItem.practicalExperiment.procedure.map((step) => (
                        <li key={step.stepNumber} className="leading-relaxed">
                          <span>{step.instruction}</span>
                          {step.safetyOrTip && (
                            <p className="ml-5 text-[11px] text-amber-600 italic">
                              ⚠️ Tip: {step.safetyOrTip}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Data Table Template */}
                  <div className="p-4 rounded-2xl border space-y-2">
                    <h4 className="font-bold text-sm">Data Collection Sheet</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-slate-300 dark:border-slate-700 text-center text-xs">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800">
                            {previewItem.practicalExperiment.dataCollectionTable.columns.map((c, i) => (
                              <th key={i} className="border border-slate-300 dark:border-slate-700 p-2 font-bold">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {previewItem.practicalExperiment.dataCollectionTable.columns.map((_, i) => (
                              <td key={i} className="border border-slate-300 dark:border-slate-700 p-3 italic text-slate-400 text-[10px]">
                                {i === 0 ? "Trial 1" : "—"}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            {previewItem.practicalExperiment.dataCollectionTable.columns.map((_, i) => (
                              <td key={i} className="border border-slate-300 dark:border-slate-700 p-3 italic text-slate-400 text-[10px]">
                                {i === 0 ? "Trial 2" : "—"}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Confidential Teacher Notes */}
              {isTeacher && previewItem.teacherNotes && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                  <h4 className="font-bold text-amber-800 dark:text-amber-300">Teacher Confidential Notes & Grading Guidance</h4>
                  <p className="text-[11px] text-amber-900 dark:text-amber-200">{previewItem.teacherNotes}</p>
                </div>
              )}
            </CardContent>

            <CardFooter className="pt-3 border-t border-slate-100 dark:border-slate-800/80 justify-end">
              <Button size="sm" onClick={() => setPreviewItem(null)}>
                Close Preview
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
