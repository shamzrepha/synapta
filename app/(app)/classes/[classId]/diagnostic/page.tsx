"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticQuestion {
  id: number;
  kcId: string;
  kcTitle: string;
  question: string;
  options: string[];
  difficulty: string;
}

interface DiagnosticSummary {
  strongKcs: Array<{ id: string; title: string; pL: number }>;
  weakKcs: Array<{ id: string; title: string; pL: number }>;
  inProgressKcs: Array<{ id: string; title: string; pL: number }>;
  suggestedFirstKc: { id: string; title: string; pL: number } | null;
  averageStartingPL: number;
}

export default function DiagnosticPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState<DiagnosticQuestion | null>(null);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answeredState, setAnsweredState] = useState<{
    isCorrect: boolean;
    correctIndex: number;
    explanation: string;
  } | null>(null);

  const [finishedSummary, setFinishedSummary] = useState<DiagnosticSummary | null>(null);

  useEffect(() => {
    let ignore = false;
    async function startDiagnostic() {
      try {
        setLoading(true);
        const res = await fetch(`/api/classes/${classId}/diagnostic/start`, {
          method: "POST",
        });
        const json = await res.json();
        if (!ignore) {
          if (json.ok && json.data) {
            setSessionId(json.data.sessionId);
            setTotalQuestions(json.data.totalQuestions);
            setCurrentIndex(json.data.currentQuestionIndex);
            setQuestion(json.data.question);
          } else {
            toast({
              title: "Diagnostic unavailable",
              description: json.error?.message || "Could not initialize diagnostic.",
              variant: "destructive",
            });
          }
        }
      } catch {
        if (!ignore) {
          toast({
            title: "Network error",
            description: "Failed to connect to diagnostic service.",
            variant: "destructive",
          });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    startDiagnostic();
    return () => {
      ignore = true;
    };
  }, [classId, toast]);

  const handleSubmitAnswer = async () => {
    if (selectedOption === null || !sessionId || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/diagnostic/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionIndex: selectedOption }),
      });
      const json = await res.json();

      if (json.ok && json.data) {
        setAnsweredState({
          isCorrect: json.data.correct,
          correctIndex: json.data.correctIndex,
          explanation: json.data.explanation,
        });

        if (json.data.finished) {
          setFinishedSummary(json.data.summary);
        } else if (json.data.nextQuestion) {
          // Pre-store next question for when student clicks Next
          setNextQuestionPayload(json.data.nextQuestion);
        }
      } else {
        toast({
          title: "Evaluation error",
          description: json.error?.message || "Could not score answer.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Submission failed",
        description: "Please check your network connection.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const [nextQuestionPayload, setNextQuestionPayload] = useState<DiagnosticQuestion | null>(null);

  const handleNextQuestion = () => {
    if (nextQuestionPayload) {
      setQuestion(nextQuestionPayload);
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setAnsweredState(null);
      setNextQuestionPayload(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  // Finished Placement Screen
  if (finishedSummary) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <Card className="border-teal-500/20 bg-white dark:bg-slate-900 p-8 text-center space-y-6 shadow-sm">
          <div className="h-16 w-16 rounded-3xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <Badge variant="emerald" className="text-xs">
              Placement Diagnostic Complete
            </Badge>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Your Cognitive Baseline is Calibrated
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              We&apos;ve mapped your existing domain competencies and customized your Curriculum Quest Map.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Baseline Mastery</span>
              <p className="text-xl font-bold text-teal-600 dark:text-teal-400 mt-1">
                {(finishedSummary.averageStartingPL * 100).toFixed(0)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Estimated class prior</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Validated Concepts</span>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {finishedSummary.strongKcs.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">High prior confidence</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Focus Target Areas</span>
              <p className="text-xl font-bold text-amber-500 mt-1">
                {finishedSummary.weakKcs.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Primary study topics</p>
            </div>
          </div>

          {finishedSummary.suggestedFirstKc && (
            <div className="p-4 rounded-xl bg-teal-500/[0.04] border border-teal-500/20 text-left flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                <Compass className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-300">
                  Recommended First Quest
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {finishedSummary.suggestedFirstKc.title}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Optimal foundational starting node to maximize downstream concept unlocks.
                </p>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link href={`/classes/${classId}/map`} className="w-full block">
              <Button size="lg" className="w-full">
                Enter Curriculum Quest Map <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <h3 className="text-lg font-bold">No diagnostic questions available</h3>
        <Link href={`/classes/${classId}`}>
          <Button variant="outline">Back to Course</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Badge variant="outline" className="text-xs">
            Placement Diagnostic
          </Badge>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Calibrating your prior Knowledge Components
          </p>
        </div>
        <div className="text-right text-xs font-bold text-slate-500">
          Question {currentIndex + 1} of {totalQuestions}
        </div>
      </div>

      {/* Question Card */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
              Topic: {question.kcTitle}
            </span>
            <Badge variant="secondary" className="text-[10px] uppercase">
              {question.difficulty}
            </Badge>
          </div>
          <CardTitle className="text-base font-bold leading-relaxed">
            {question.question}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 pt-2">
          {question.options.map((opt, idx) => {
            const isSelected = selectedOption === idx;
            const isAnswered = answeredState !== null;
            const isCorrectOption = answeredState?.correctIndex === idx;
            const isWrongSelection = isSelected && !answeredState?.isCorrect;

            return (
              <button
                key={idx}
                type="button"
                disabled={isAnswered || submitting}
                onClick={() => setSelectedOption(idx)}
                className={cn(
                  "w-full text-left p-3.5 rounded-xl border text-xs md:text-sm transition-all flex items-center justify-between gap-3",
                  isSelected && !isAnswered
                    ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 font-medium"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900",
                  isAnswered && isCorrectOption
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-semibold"
                    : "",
                  isAnswered && isWrongSelection
                    ? "border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-200 font-semibold"
                    : ""
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span>{opt}</span>
                </div>

                {isAnswered && isCorrectOption && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                )}
                {isAnswered && isWrongSelection && (
                  <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                )}
              </button>
            );
          })}

          {/* Explanation Banner */}
          {answeredState && (
            <div
              className={cn(
                "p-4 rounded-xl border text-xs space-y-1.5 mt-4",
                answeredState.isCorrect
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {answeredState.isCorrect ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Correct!
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-amber-600" /> Conceptual Explanation
                  </>
                )}
              </div>
              <p className="leading-relaxed">{answeredState.explanation}</p>
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-2 flex justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
          <Link href={`/classes/${classId}`}>
            <Button size="sm" variant="ghost" className="text-xs">
              Exit Diagnostic
            </Button>
          </Link>

          {!answeredState ? (
            <Button
              size="sm"
              disabled={selectedOption === null || submitting}
              onClick={handleSubmitAnswer}
            >
              {submitting ? "Evaluating..." : "Submit Answer"}
            </Button>
          ) : (
            <Button size="sm" onClick={handleNextQuestion}>
              Next Question <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
