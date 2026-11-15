"use client";

import React, { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Clock,
  Activity,
  Plus,
  CheckCircle2,
  RefreshCw,
  Zap,
  TrendingUp,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sprout } from "@/components/bot/sprout";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  COHORT_IDS,
  DEFAULT_PEER_MEDIAN_MS,
  LEARNING_COHORTS,
  type LearnerTelemetryProfile,
  type LearningCohortId,
} from "@/lib/learning/telemetry";

interface StepDetail {
  stepNumber: number;
  title: string;
  detail: string;
}

interface QuestionSolution {
  cohortStyle?: LearningCohortId;
  keyPrinciple?: string;
  formulas?: string[];
  hints?: string[];
  steps?: StepDetail[];
  finalAnswer?: string;
  examinerTraps?: string[];
  twinQuestion?: {
    question: string;
    solution: string;
  };
}

interface PastQuestionItem {
  id: string;
  year?: string;
  questionNumber?: number | string;
  topic?: string;
  questionText: string;
  peerMedianMs?: number;
  solution?: QuestionSolution;
  cohortSolutions?: Partial<Record<LearningCohortId, QuestionSolution>>;
  cached?: boolean;
}

const STARTER_QUESTIONS: PastQuestionItem[] = [
  {
    id: "q1",
    year: "2023 Exam",
    questionNumber: "1(a)",
    topic: "Divide & Conquer Recurrences",
    peerMedianMs: 95_000,
    questionText:
      "Define time complexity and derive the worst-case and average-case time complexities of QuickSort with a detailed recurrence relation.",
  },
  {
    id: "q2",
    year: "2023 Exam",
    questionNumber: "1(b)",
    topic: "Array Partitioning Schemes",
    peerMedianMs: 85_000,
    questionText:
      "Given an array of integers [12, 11, 13, 5, 6, 7], trace the step-by-step partitioning using the Lomuto partition scheme with the last element as pivot.",
  },
  {
    id: "q3",
    year: "2022 Exam",
    questionNumber: "2",
    topic: "Graph Traversal & Cycle Detection",
    peerMedianMs: 105_000,
    questionText:
      "Explain the difference between a Graph BFS and DFS traversal. Write the pseudocode for detecting a cycle in a directed graph using DFS.",
  },
];

function formatDurationSec(ms: number): string {
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function PastQuestionsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [questions, setQuestions] = useState<PastQuestionItem[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<PastQuestionItem | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [solving, setSolving] = useState(false);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showTwinSolution, setShowTwinSolution] = useState(false);
  const [hintsCount, setHintsCount] = useState(0);

  // Adaptive FYP Telemetry State
  const [telemetry, setTelemetry] = useState<LearnerTelemetryProfile | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<LearningCohortId>("step_by_step_procedural");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingTelemetry, setRecordingTelemetry] = useState(false);
  const questionStartRef = useRef<number>(0);

  // Teacher Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newYear, setNewYear] = useState("2024 Exam");
  const [newQNum, setNewQNum] = useState("1(a)");
  const [newTopic, setNewTopic] = useState("");
  const [newText, setNewText] = useState("");

  useEffect(() => {
    fetch(`/api/classes/${classId}/past-questions`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) {
          setIsSubscriber(Boolean(j.data.isSubscriber));
          setCanUpload(Boolean(j.data.canUpload));
          if (j.data.telemetryProfile) {
            setTelemetry(j.data.telemetryProfile);
            setSelectedCohort(j.data.telemetryProfile.dominantCohort || "step_by_step_procedural");
          }
          const items: PastQuestionItem[] = j.data.items || [];
          const list = items.length > 0 ? items : STARTER_QUESTIONS;
          setQuestions(list);
          setActiveQuestion(list[0] || null);
        }
      })
      .catch(() => null)
      .finally(() => setInitialLoading(false));
  }, [classId]);

  // Live dwell-time counter for the currently active question
  useEffect(() => {
    questionStartRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - questionStartRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeQuestion?.id]);

  // Resolve the solution to display for the currently selected learning cohort
  const displayedSolution: QuestionSolution | undefined =
    activeQuestion?.cohortSolutions?.[selectedCohort] || activeQuestion?.solution;

  const solveForCohort = async (q: PastQuestionItem, cohortId: LearningCohortId) => {
    // Check if already cached in client state for this cohort
    if (q.cohortSolutions?.[cohortId]) {
      setSelectedCohort(cohortId);
      return;
    }

    setSolving(true);
    try {
      const res = await fetch(`/api/classes/${classId}/past-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: q.id,
          questionText: q.questionText,
          topic: q.topic || "Core Syllabus",
          courseCode: classId,
          cohortId,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setShowUpgradeModal(true);
          return;
        }
        toast({
          title: "Couldn't load explanation",
          description: j?.error?.message || "Please try again",
          variant: "destructive",
        });
        return;
      }

      const sol: QuestionSolution | undefined = j.data?.solution;
      const updated: PastQuestionItem = {
        ...q,
        solution: sol || q.solution,
        cohortSolutions: {
          ...(q.cohortSolutions || {}),
          ...(sol ? { [cohortId]: sol } : {}),
        },
        cached: Boolean(j.data?.cached),
      };
      setSelectedCohort(cohortId);
      setActiveQuestion(updated);
      setQuestions((prev) => prev.map((item) => (item.id === q.id ? updated : item)));
    } catch {
      toast({ title: "Connection error", description: "Check network connection", variant: "destructive" });
    } finally {
      setSolving(false);
    }
  };

  const recordLearningSignal = async (correct: boolean, preferredCohort?: LearningCohortId) => {
    if (!activeQuestion) return;
    setRecordingTelemetry(true);
    try {
      const dwellMs = Math.max(5_000, Date.now() - questionStartRef.current);
      const formulas = displayedSolution?.formulas || [];
      const res = await fetch("/api/study/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          questionId: activeQuestion.id,
          topic: activeQuestion.topic || "Core Syllabus",
          formulas,
          dwellMs,
          hintsUsed: hintsCount,
          correct,
          preferredCohort,
        }),
      });
      const j = await res.json();
      if (res.ok && j.ok && j.data?.profile) {
        setTelemetry(j.data.profile);
        toast({
          title: correct ? "Mastery recorded!" : "Adaptive algorithm updated",
          description: correct
            ? `Exam readiness: ${j.data.profile.predictedExamReadiness}% (+${j.data.profile.predictedWeeklyGain}%/wk pace)`
            : `Sprout flagged these formulas for micro-step practice.`,
        });
      }
    } catch {
      // Non-blocking telemetry
    } finally {
      setRecordingTelemetry(false);
    }
  };

  const handleTeacherUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !newTopic.trim()) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/classes/${classId}/past-questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: newYear.trim() || "Past Exam",
          questionNumber: newQNum.trim() || "1",
          topic: newTopic.trim(),
          questionText: newText.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Upload failed",
          description: j?.error?.message || "Could not save question",
          variant: "destructive",
        });
        return;
      }
      const created: PastQuestionItem = j.data;
      setQuestions((prev) => [created, ...prev]);
      setActiveQuestion(created);
      setShowUploadModal(false);
      setNewText("");
      setNewTopic("");
      toast({ title: "Past question added", description: "Students can now study this question step-by-step." });
    } catch {
      toast({ title: "Network error", description: "Try again shortly", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const peerMedianMs = activeQuestion?.peerMedianMs || DEFAULT_PEER_MEDIAN_MS;
  const isSlowerThanPeers = elapsedMs > peerMedianMs * 1.25;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/classes/${classId}`}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Class
        </Link>
        <div className="flex items-center gap-2">
          {canUpload && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUploadModal(true)}
              className="text-xs font-semibold h-8"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Past Question
            </Button>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-600 font-bold border border-brand-500/20 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {isSubscriber ? "Full Access Pass" : "Free Preview Mode"}
          </span>
        </div>
      </div>

      <div className="border-b pb-4">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-brand-600" /> Past Questions & Adaptive Cohort Tutor
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sprout watches how long each topic takes you compared to classmates and adapts explanations to your learning cohort.
        </p>
      </div>

      {/* TikTok / FYP-Style Personal Learning Telemetry Pulse */}
      <div className="rounded-2xl border border-brand-500/25 bg-gradient-to-r from-brand-500/10 via-card to-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-12 shrink-0 flex items-center justify-center">
              <Sprout pose={isSlowerThanPeers ? "think" : "jump"} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1">
                  <Activity className="h-3 w-3" /> Adaptive FYP Mode
                </span>
                <span className="text-xs font-bold text-foreground">
                  Cohort: {LEARNING_COHORTS[selectedCohort].label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {LEARNING_COHORTS[selectedCohort].description}
              </p>
            </div>
          </div>

          {/* Live Dwell vs Peer Benchmark & Predicted Exam Readiness */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div
              className={cn(
                "px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 font-semibold",
                isSlowerThanPeers
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border bg-slate-50 dark:bg-slate-800/60 text-foreground"
              )}
            >
              <Clock className="h-3.5 w-3.5 text-brand-600" />
              <span>
                Time: {formatDurationSec(elapsedMs)}{" "}
                <span className="text-muted-foreground font-normal">
                  (Peer median: {formatDurationSec(peerMedianMs)})
                </span>
              </span>
            </div>

            {telemetry && (
              <div className="px-2.5 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>
                  Readiness: {telemetry.predictedExamReadiness}% (+{telemetry.predictedWeeklyGain}%/wk)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Cohort Style Switcher (Pre-cached per learning group for $0 marginal AI cost) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">Explanation Style:</span>
            {COHORT_IDS.map((cid) => {
              const active = selectedCohort === cid;
              const isCachedForQuestion = Boolean(activeQuestion?.cohortSolutions?.[cid]);
              return (
                <button
                  key={cid}
                  type="button"
                  disabled={solving}
                  onClick={() => {
                    setSelectedCohort(cid);
                    if (activeQuestion && (activeQuestion.solution || activeQuestion.cohortSolutions)) {
                      void solveForCohort(activeQuestion, cid);
                    }
                  }}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-lg border transition flex items-center gap-1",
                    active
                      ? "bg-brand-600 text-white border-brand-600 font-bold"
                      : "bg-card hover:bg-slate-100 dark:hover:bg-slate-800 border-border text-muted-foreground"
                  )}
                >
                  <span>{LEARNING_COHORTS[cid].shortLabel}</span>
                  {isCachedForQuestion && <Zap className="h-2.5 w-2.5 text-amber-400" />}
                </button>
              );
            })}
          </div>

          {telemetry && telemetry.weakFormulas.length > 0 && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>
                Focus formula: <code className="font-mono font-bold">{telemetry.weakFormulas[0].formula}</code>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid */}
      {initialLoading ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">Loading class past questions...</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Question Selector List */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
              Exam Question Bank ({questions.length})
            </h3>
            <div className="space-y-2">
              {questions.map((q) => {
                const active = activeQuestion?.id === q.id;
                const hasAnySolution = Boolean(q.solution || (q.cohortSolutions && Object.keys(q.cohortSolutions).length > 0));
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setActiveQuestion(q);
                      setShowHints(false);
                      setShowTwinSolution(false);
                      setHintsCount(0);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition text-xs flex flex-col gap-1",
                      active
                        ? "bg-brand-50/80 dark:bg-brand-950/40 border-brand-600 ring-1 ring-brand-600 shadow-sm"
                        : "bg-card hover:bg-slate-50 dark:hover:bg-slate-800/50 border-border"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-brand-600">
                        {q.year || "Past Exam"} • Q{q.questionNumber || "1"}
                      </span>
                      {hasAnySolution && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                          Pre-stored
                        </span>
                      )}
                    </div>
                    {q.topic && (
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {q.topic}
                      </span>
                    )}
                    <p className="line-clamp-2 text-foreground/90 font-medium">{q.questionText}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question & Step-by-Step View */}
          <div className="md:col-span-2 space-y-4">
            {activeQuestion ? (
              <Card className="border border-border shadow-sm p-5 space-y-5">
                {/* Question Statement */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-foreground">
                        {activeQuestion.year} — Question {activeQuestion.questionNumber}
                      </span>
                      {activeQuestion.topic && (
                        <span className="text-xs font-semibold text-brand-600">{activeQuestion.topic}</span>
                      )}
                    </div>
                    {activeQuestion.cached && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Instant cohort cache ($0 AI tokens)
                      </span>
                    )}
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-foreground leading-relaxed">
                    {activeQuestion.questionText}
                  </p>
                </div>

                {/* Solution Section */}
                {displayedSolution ? (
                  <div className="space-y-5 pt-3 border-t">
                    {/* Optional Progressive Hints */}
                    {displayedSolution.hints && displayedSolution.hints.length > 0 && (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-border">
                        <div className="flex items-center gap-2 text-xs">
                          <HelpCircle className="h-4 w-4 text-brand-600 shrink-0" />
                          {showHints ? (
                            <span className="text-foreground font-medium">{displayedSolution.hints.join(" • ")}</span>
                          ) : (
                            <span className="text-muted-foreground">Want a quick clue before reading every step?</span>
                          )}
                        </div>
                        {!showHints && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2"
                            onClick={() => {
                              setShowHints(true);
                              setHintsCount((c) => c + 1);
                            }}
                          >
                            Show Hint
                          </Button>
                        )}
                      </div>
                    )}

                    {/* 1. Key Principle & Formulas */}
                    {displayedSolution.keyPrinciple && (
                      <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1.5">
                        <span className="text-xs font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                          <Lightbulb className="h-4 w-4" /> Core Concept ({LEARNING_COHORTS[selectedCohort].shortLabel})
                        </span>
                        <p className="text-xs text-foreground leading-relaxed">{displayedSolution.keyPrinciple}</p>
                        {displayedSolution.formulas && displayedSolution.formulas.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {displayedSolution.formulas.map((f, i) => (
                              <span
                                key={i}
                                className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-foreground"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 2. Step-by-Step Derivation */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        Step-by-Step Worked Derivation
                      </h4>
                      <div className="space-y-2.5">
                        {displayedSolution.steps?.map((step) => (
                          <div
                            key={step.stepNumber}
                            className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-800/40 space-y-1"
                          >
                            <span className="text-xs font-bold text-brand-600">
                              Step {step.stepNumber}: {step.title}
                            </span>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {step.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. Final Answer Box */}
                    {displayedSolution.finalAnswer && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Final Answer:</span>
                        <span className="font-mono text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                          {displayedSolution.finalAnswer}
                        </span>
                      </div>
                    )}

                    {/* 4. Examiner Traps & Common Pitfalls */}
                    {displayedSolution.examinerTraps && displayedSolution.examinerTraps.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-amber-600" /> Where Students Lose Marks (Examiner Traps)
                        </span>
                        <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                          {displayedSolution.examinerTraps.map((trap, i) => (
                            <li key={i}>{trap}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 5. Twin Practice Question */}
                    {displayedSolution.twinQuestion && (
                      <div className="p-4 rounded-xl border border-dashed border-brand-500/40 bg-card space-y-2">
                        <span className="text-xs font-bold text-brand-600 flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5" /> Twin Practice Question (Test Yourself)
                        </span>
                        <p className="text-xs text-foreground font-medium">
                          {displayedSolution.twinQuestion.question}
                        </p>
                        <div>
                          {showTwinSolution ? (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-2 bg-slate-50 dark:bg-slate-900 p-2 rounded">
                              {displayedSolution.twinQuestion.solution}
                            </p>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-muted-foreground h-7 px-2"
                              onClick={() => setShowTwinSolution(true)}
                            >
                              Reveal Twin Solution
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 6. Adaptive Telemetry Feedback Bar */}
                    <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        How did this explanation feel for your learning style?
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={recordingTelemetry || solving}
                          onClick={() => {
                            const nextCohort: LearningCohortId =
                              selectedCohort === "step_by_step_procedural"
                                ? "visual_intuitive"
                                : "step_by_step_procedural";
                            setHintsCount((c) => c + 1);
                            void recordLearningSignal(false, nextCohort);
                            void solveForCohort(activeQuestion, nextCohort);
                          }}
                          className="text-xs h-8"
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Explain Differently
                        </Button>
                        <Button
                          size="sm"
                          disabled={recordingTelemetry}
                          onClick={() => void recordLearningSignal(true, selectedCohort)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8"
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> I Mastered This
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Unsolved Prompt */
                  <div className="text-center py-8 space-y-3">
                    <div className="relative w-14 h-16 mx-auto flex items-center justify-center">
                      <Sprout pose="think" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">
                        Break this down in {LEARNING_COHORTS[selectedCohort].shortLabel} style
                      </h4>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                        Sprout will load your cohort&apos;s step-by-step derivation, key formulas, and examiner pitfalls.
                      </p>
                    </div>
                    <Button
                      onClick={() => void solveForCohort(activeQuestion, selectedCohort)}
                      isLoading={solving}
                      className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs"
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" /> Reveal Step-by-Step Solution
                    </Button>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-8 text-center text-muted-foreground text-xs">
                Select an exam question from the left column to view.
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Teacher Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <form
            onSubmit={handleTeacherUpload}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div>
              <h3 className="text-base font-bold">Add Past Exam Question</h3>
              <p className="text-xs text-muted-foreground">
                Once uploaded, Sprout pre-stores cohort explanations so all students in your class study at minimal AI cost.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Exam Year / Session</label>
                <Input
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="2023/2024 Rain"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Question No.</label>
                <Input
                  value={newQNum}
                  onChange={(e) => setNewQNum(e.target.value)}
                  placeholder="2(b)"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Syllabus Topic</label>
              <Input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="e.g. Laplace Transforms, Second Law of Thermodynamics..."
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Full Question Text</label>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                rows={4}
                required
                placeholder="Paste the exact past examination question here..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowUploadModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                isLoading={uploading}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs"
              >
                Save Question
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Upgrade Modal for Free Users who exhaust preview */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-14 shrink-0 flex items-center justify-center">
                <Sprout pose="wave" />
              </div>
              <div>
                <h3 className="text-base font-bold">Unlock All Past Questions</h3>
                <p className="text-xs text-muted-foreground">You have used your 1 free preview question.</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="p-3 rounded-xl border border-brand-500/40 bg-brand-500/10 space-y-1">
                <div className="flex justify-between items-baseline font-bold text-xs">
                  <span className="text-brand-900 dark:text-brand-200">Exam Month Pass</span>
                  <span className="text-brand-600">₦1,500 / month</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  30 days of full step-by-step past questions, worked math, and twin practice drills.
                </p>
              </div>

              <div className="p-3 rounded-xl border-2 border-brand-600 bg-brand-50 dark:bg-brand-950/30 space-y-1">
                <div className="flex justify-between items-baseline font-bold text-xs">
                  <span className="text-brand-900 dark:text-brand-200">Plus Semester Pass (Best Value)</span>
                  <span className="text-brand-600">₦11,000 / 135 Days</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Everything included: Past Questions at no extra cost, upload own notes, 3D Maker Studio labs, and audio podcasts.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowUpgradeModal(false)}>
                Maybe Later
              </Button>
              <Link href="/settings?tab=plan">
                <Button size="sm" className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs">
                  Upgrade Now
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
