"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, ChevronRight, HelpCircle, Lock, Sparkles, AlertTriangle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sprout } from "@/components/bot/sprout";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface StepDetail {
  stepNumber: number;
  title: string;
  detail: string;
}

interface QuestionSolution {
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
  questionText: string;
  solution?: QuestionSolution;
  cached?: boolean;
}

export default function PastQuestionsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [questions, setQuestions] = useState<PastQuestionItem[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<PastQuestionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [solving, setSolving] = useState(false);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showTwinSolution, setShowTwinSolution] = useState(false);

  useEffect(() => {
    fetch(`/api/classes/${classId}/past-questions`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) {
          setIsSubscriber(!!j.data.isSubscriber);
          const items: PastQuestionItem[] = j.data.items || [];
          // If no questions in DB yet, provide realistic starter past questions for the class
          if (items.length === 0) {
            const starter: PastQuestionItem[] = [
              {
                id: "q1",
                year: "2023 Exam",
                questionNumber: "1(a)",
                questionText: "Define time complexity and derive the worst-case and average-case time complexities of QuickSort with a detailed recurrence relation.",
              },
              {
                id: "q2",
                year: "2023 Exam",
                questionNumber: "1(b)",
                questionText: "Given an array of integers [12, 11, 13, 5, 6, 7], trace the step-by-step partitioning using the Lomuto partition scheme with the last element as pivot.",
              },
              {
                id: "q3",
                year: "2022 Exam",
                questionNumber: "2",
                questionText: "Explain the difference between a Graph BFS and DFS traversal. Write the pseudocode for detecting a cycle in a directed graph using DFS.",
              },
            ];
            setQuestions(starter);
            setActiveQuestion(starter[0]);
          } else {
            setQuestions(items);
            setActiveQuestion(items[0] || null);
          }
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [classId]);

  const solveCurrentQuestion = async (q: PastQuestionItem) => {
    if (q.solution) return; // Already cached!
    setSolving(true);
    try {
      const res = await fetch(`/api/classes/${classId}/past-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: q.id,
          questionText: q.questionText,
          courseCode: classId,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setShowUpgradeModal(true);
          return;
        }
        toast({ title: "Couldn't solve question", description: j?.error?.message || "Please try again", variant: "destructive" });
        return;
      }
      const updated: PastQuestionItem = { ...q, solution: j.data?.solution, cached: j.data?.cached };
      setActiveQuestion(updated);
      setQuestions((prev) => prev.map((item) => (item.id === q.id ? updated : item)));
    } catch {
      toast({ title: "Connection error", description: "Check network connection", variant: "destructive" });
    } finally {
      setSolving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link href={`/classes/${classId}`} className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Class
        </Link>
        <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-600 font-bold border border-brand-500/20">
          {isSubscriber ? "⭐ Full Access Subscriber" : "Free Preview Mode"}
        </span>
      </div>

      <div className="border-b pb-4">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-brand-600" /> Past Questions & Step-by-Step Solutions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Master real examination questions with step-by-step derivations, marking tips, and examiner pitfalls.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Question Selector List */}
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">Exam Questions</h3>
          <div className="space-y-2">
            {questions.map((q) => {
              const active = activeQuestion?.id === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    setActiveQuestion(q);
                    setShowHints(false);
                    setShowTwinSolution(false);
                  }}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border transition text-xs flex flex-col gap-1",
                    active
                      ? "bg-brand-50/80 dark:bg-brand-950/40 border-brand-600 ring-1 ring-brand-600 shadow-sm"
                      : "bg-card hover:bg-slate-50 dark:hover:bg-slate-800/50 border-border"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-brand-600">{q.year || "Past Exam"} • Q{q.questionNumber || "1"}</span>
                    {q.solution && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">Solved</span>}
                  </div>
                  <p className="line-clamp-2 text-muted-foreground font-medium">{q.questionText}</p>
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
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-foreground">
                    {activeQuestion.year} — Question {activeQuestion.questionNumber}
                  </span>
                  {activeQuestion.cached && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      ⚡ Instant pre-stored solution
                    </span>
                  )}
                </div>
                <p className="text-sm sm:text-base font-semibold text-foreground leading-relaxed">
                  {activeQuestion.questionText}
                </p>
              </div>

              {/* Solution Section */}
              {activeQuestion.solution ? (
                <div className="space-y-5 pt-3 border-t">
                  {/* 1. Key Principle & Formulas */}
                  {activeQuestion.solution.keyPrinciple && (
                    <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1.5">
                      <span className="text-xs font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                        <Lightbulb className="h-4 w-4" /> Core Concept & Method
                      </span>
                      <p className="text-xs text-foreground leading-relaxed">{activeQuestion.solution.keyPrinciple}</p>
                      {activeQuestion.solution.formulas && activeQuestion.solution.formulas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {activeQuestion.solution.formulas.map((f, i) => (
                            <span key={i} className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-foreground">
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
                      {activeQuestion.solution.steps?.map((step) => (
                        <div key={step.stepNumber} className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-800/40 space-y-1">
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
                  {activeQuestion.solution.finalAnswer && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Final Answer:</span>
                      <span className="font-mono text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                        {activeQuestion.solution.finalAnswer}
                      </span>
                    </div>
                  )}

                  {/* 4. Examiner Traps & Common Pitfalls */}
                  {activeQuestion.solution.examinerTraps && activeQuestion.solution.examinerTraps.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4 text-amber-600" /> Where Students Lose Marks (Examiner Traps)
                      </span>
                      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                        {activeQuestion.solution.examinerTraps.map((trap, i) => (
                          <li key={i}>{trap}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 5. Twin Practice Question */}
                  {activeQuestion.solution.twinQuestion && (
                    <div className="p-4 rounded-xl border border-dashed border-brand-500/40 bg-card space-y-2">
                      <span className="text-xs font-bold text-brand-600 flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" /> Twin Practice Question (Test Yourself)
                      </span>
                      <p className="text-xs text-foreground font-medium">
                        {activeQuestion.solution.twinQuestion.question}
                      </p>
                      <div>
                        {showTwinSolution ? (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-2 bg-slate-50 dark:bg-slate-900 p-2 rounded">
                            {activeQuestion.solution.twinQuestion.solution}
                          </p>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground h-7 px-2" onClick={() => setShowTwinSolution(true)}>
                            Reveal Twin Solution
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Unsolved Prompt */
                <div className="text-center py-8 space-y-3">
                  <div className="relative w-14 h-16 mx-auto flex items-center justify-center">
                    <Sprout pose="think" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">Ready to break this down step-by-step?</h4>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                      Sprout will derive the formulas, show the intermediate math, and warn you of examiner tricks.
                    </p>
                  </div>
                  <Button
                    onClick={() => void solveCurrentQuestion(activeQuestion)}
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
                  Everything included: Past Questions, upload own notes, 3D Maker Studio labs, and audio podcasts.
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
