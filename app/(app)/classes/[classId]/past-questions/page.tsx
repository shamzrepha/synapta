"use client";

import React, { useState, useEffect, useRef, useMemo, use } from "react";
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
  Camera,
  CheckSquare,
  FileText,
  Share2,
  ArrowRight,
  Award,
  Layers,
  ScanLine,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sprout } from "@/components/bot/sprout";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";
import { ReadinessShareModal } from "@/components/study/readiness-share-card";
import { cn } from "@/lib/utils";
import {
  COHORT_IDS,
  DEFAULT_PEER_MEDIAN_MS,
  LEARNING_COHORTS,
  pickNextRecommendedQuestion,
  type LearnerTelemetryProfile,
  type LearningCohortId,
  type PastQuestionFormat,
} from "@/lib/learning/telemetry";

interface StepDetail {
  stepNumber: number;
  title: string;
  detail: string;
}

interface CbtBlock {
  stem: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
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
  cbtBlock?: CbtBlock;
}

interface PastQuestionItem {
  id: string;
  year?: string;
  questionNumber?: number | string;
  topic?: string;
  questionType?: PastQuestionFormat;
  marks?: number;
  questionText: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  peerMedianMs?: number;
  solution?: QuestionSolution;
  cohortSolutions?: Partial<Record<LearningCohortId, QuestionSolution>>;
  cached?: boolean;
  selfHealed?: boolean;
}

interface HandwrittenGradeReport {
  scoreAwarded: number;
  maxMarks: number;
  scorePercent: number;
  verdict: "excellent" | "partial" | "needs_work";
  transcribedSteps: string[];
  stepFeedback: {
    step: string;
    status: "correct" | "partial" | "error";
    comment: string;
  }[];
  missingFormulasOrUnits: string[];
  examinerAdvice: string;
}

type PracticeMode = "study" | "cbt" | "handwritten";

const STARTER_QUESTIONS: PastQuestionItem[] = [
  {
    id: "q1",
    year: "2023 Exam",
    questionNumber: "1(a)",
    topic: "Divide & Conquer Recurrences",
    questionType: "theory",
    marks: 15,
    peerMedianMs: 95_000,
    questionText:
      "Define time complexity and derive the worst-case and average-case time complexities of QuickSort with a detailed recurrence relation.",
    options: [
      "Worst-case O(n^2), Average-case O(n log n)",
      "Worst-case O(n log n), Average-case O(n)",
      "Worst-case O(2^n), Average-case O(n^2)",
      "Worst-case O(n), Average-case O(log n)",
    ],
    correctIndex: 0,
    explanation:
      "Unbalanced partitions yield T(n) = T(n-1) + O(n) = O(n^2), whereas balanced splits yield T(n) = 2T(n/2) + O(n) = O(n log n).",
  },
  {
    id: "q2",
    year: "2023 Exam",
    questionNumber: "1(b)",
    topic: "Array Partitioning Schemes",
    questionType: "calculation",
    marks: 15,
    peerMedianMs: 85_000,
    questionText:
      "Given an array of integers [12, 11, 13, 5, 6, 7], trace the step-by-step partitioning using the Lomuto partition scheme with the last element (7) as pivot.",
    options: [
      "Final pivot 7 lands at index 2 with [5, 6, 7, 12, 11, 13]",
      "Final pivot 7 lands at index 0 with [7, 12, 11, 13, 5, 6]",
      "Final pivot 7 lands at index 5 with [12, 11, 13, 5, 6, 7]",
      "Final pivot 7 lands at index 3 with [5, 6, 11, 7, 12, 13]",
    ],
    correctIndex: 0,
    explanation:
      "Elements smaller than or equal to pivot 7 are 5 and 6; they are swapped to indices 0 and 1, placing pivot 7 at index 2.",
  },
  {
    id: "q3",
    year: "2022 Exam",
    questionNumber: "2(a)",
    topic: "Graph Traversal & Cycle Detection",
    questionType: "theory",
    marks: 15,
    peerMedianMs: 105_000,
    questionText:
      "Explain the difference between a Graph BFS and DFS traversal. Write the pseudocode for detecting a cycle in a directed graph using DFS recursion stack states.",
    options: [
      "BFS uses a FIFO Queue (O(V+E)); DFS uses a LIFO Stack/Recursion and detects cycles via back-edges to grey nodes",
      "BFS uses a Stack; DFS uses a Priority Queue",
      "BFS only works on trees; DFS only works on weighted graphs",
      "Both require O(V^3) time complexity on sparse graphs",
    ],
    correctIndex: 0,
    explanation:
      "A cycle in a directed graph exists if and only if DFS encounters a back-edge pointing to a vertex currently in the active recursion stack.",
  },
  {
    id: "q4",
    year: "2022 Exam",
    questionNumber: "Obj 4",
    topic: "Divide & Conquer Recurrences",
    questionType: "objective",
    marks: 5,
    peerMedianMs: 45_000,
    questionText:
      "Using the Master Theorem, solve the recurrence relation T(n) = 4T(n/2) + n^2.",
    options: ["Theta(n^2 log n)", "Theta(n^2)", "Theta(n^4)", "Theta(n log n)"],
    correctIndex: 0,
    explanation:
      "Here a = 4, b = 2, so n^(log_b a) = n^(log_2 4) = n^2. Since f(n) = n^2 matches n^(log_b a), Case 2 applies: T(n) = Theta(n^2 log n).",
  },
];

function formatDurationSec(ms: number): string {
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Shrinks a snapped handwritten photo or exam sheet to a clean JPEG dataURL */
async function compressImageFile(file: File, maxDim = 1280): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(bmp, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function PastQuestionsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  const { toast } = useToast();
  const user = useUserStore((s) => s.user);

  const [classTitle, setClassTitle] = useState<string>(classId);
  const [classInstitution, setClassInstitution] = useState<string | null>(null);
  const [classDepartment, setClassDepartment] = useState<string | null>(null);

  const [questions, setQuestions] = useState<PastQuestionItem[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<PastQuestionItem | null>(null);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("study");
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>("all");

  const [solving, setSolving] = useState(false);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showTwinSolution, setShowTwinSolution] = useState(false);
  const [hintsCount, setHintsCount] = useState(0);

  // Adaptive FYP Telemetry State
  const [telemetry, setTelemetry] = useState<LearnerTelemetryProfile | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<LearningCohortId>("step_by_step_procedural");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingTelemetry, setRecordingTelemetry] = useState(false);
  const questionStartRef = useRef<number>(0);

  // CBT Mode State
  const [cbtAnswers, setCbtAnswers] = useState<Record<string, number>>({});
  const [cbtSubmitted, setCbtSubmitted] = useState(false);
  const [cbtIndex, setCbtIndex] = useState(0);
  const [cbtFocusWarnings, setCbtFocusWarnings] = useState(0);

  // Handwritten Snap & Grader State
  const [snapPreviewUrl, setSnapPreviewUrl] = useState<string | null>(null);
  const [writtenWork, setWrittenWork] = useState("");
  const [gradingHandwritten, setGradingHandwritten] = useState(false);
  const [handwrittenReport, setHandwrittenReport] = useState<HandwrittenGradeReport | null>(null);
  const snapFileInputRef = useRef<HTMLInputElement>(null);

  // Teacher Single + Bulk Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTab, setUploadTab] = useState<"single" | "bulk_scan">("single");
  const [uploading, setUploading] = useState(false);
  const [newYear, setNewYear] = useState("2024 Exam");
  const [newQNum, setNewQNum] = useState("1(a)");
  const [newTopic, setNewTopic] = useState("");
  const [newType, setNewType] = useState<PastQuestionFormat>("theory");
  const [newMarks, setNewMarks] = useState(15);
  const [newText, setNewText] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>(["", "", "", ""]);
  const [newCorrectIdx, setNewCorrectIdx] = useState(0);
  const [bulkScanImageUrl, setBulkScanImageUrl] = useState<string | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/classes/${classId}/past-questions`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) {
          if (j.data.classTitle) setClassTitle(j.data.classTitle);
          if (j.data.classInstitution) setClassInstitution(j.data.classInstitution);
          if (j.data.classDepartment) setClassDepartment(j.data.classDepartment);
          setIsSubscriber(Boolean(j.data.isSubscriber));
          setCanUpload(Boolean(j.data.canUpload));
          if (j.data.telemetryProfile) {
            setTelemetry(j.data.telemetryProfile);
            setSelectedCohort(j.data.telemetryProfile.dominantCohort || "step_by_step_procedural");
          }
          const items: PastQuestionItem[] = j.data.items || [];
          const list = items.length > 0 ? items : STARTER_QUESTIONS;
          setQuestions(list);
          // Pick first recommended uncompleted question based on completion
          const nextRec = pickNextRecommendedQuestion(list, j.data.telemetryProfile);
          setActiveQuestion(nextRec || list[0] || null);
        }
      })
      .catch(() => null);
  }, [classId]);

  // Live dwell-time counter for the currently active question
  useEffect(() => {
    questionStartRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - questionStartRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeQuestion?.id, practiceMode]);

  // CBT Anti-Cheat Tab-Switch & Focus Lock Monitor
  useEffect(() => {
    if (practiceMode !== "cbt" || cbtSubmitted) return;
    const onVisibility = () => {
      if (document.hidden) {
        setCbtFocusWarnings((w) => w + 1);
        toast({
          title: "CBT Focus Lock Warning",
          description: "Tab switch detected during active CBT simulation. Keep this exam window focused.",
          variant: "amber",
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [practiceMode, cbtSubmitted, toast]);

  // Extract distinct syllabus topics and completion counts
  const completedIdsSet = useMemo(
    () => new Set(telemetry?.completedQuestionIds || []),
    [telemetry?.completedQuestionIds]
  );

  const topicsSummary = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const q of questions) {
      const t = q.topic || "Core Syllabus";
      const cur = map.get(t) || { total: 0, completed: 0 };
      cur.total += 1;
      if (completedIdsSet.has(q.id)) cur.completed += 1;
      map.set(t, cur);
    }
    return Array.from(map.entries()).map(([topic, stats]) => ({
      topic,
      total: stats.total,
      completed: stats.completed,
    }));
  }, [questions, completedIdsSet]);

  const filteredQuestions = useMemo(() => {
    if (selectedTopicFilter === "all") return questions;
    return questions.filter((q) => (q.topic || "Core Syllabus") === selectedTopicFilter);
  }, [questions, selectedTopicFilter]);

  // Build CBT question items from all questions that have either direct options or a solution.cbtBlock
  const cbtPool = useMemo(() => {
    return filteredQuestions.map((q) => {
      const cbt = q.solution?.cbtBlock;
      const opts =
        q.options && q.options.length >= 2
          ? q.options
          : cbt?.options && cbt.options.length >= 2
          ? cbt.options
          : [
              "Apply primary recurrence / conservation theorem directly",
              "Neglect boundary conditions and initial state constants",
              "Assume constant O(1) complexity regardless of input size",
              "Skip intermediate unit conversion before substitution",
            ];
      const correctIdx =
        typeof q.correctIndex === "number"
          ? q.correctIndex
          : typeof cbt?.correctIndex === "number"
          ? cbt.correctIndex
          : 0;
      const stem = cbt?.stem || q.questionText;
      const explanation =
        q.explanation || cbt?.explanation || q.solution?.keyPrinciple || "Review the step-by-step derivation.";
      return {
        id: q.id,
        year: q.year || "Past Exam",
        questionNumber: q.questionNumber || "1",
        topic: q.topic || "Core Syllabus",
        stem,
        options: opts,
        correctIndex: correctIdx,
        explanation,
      };
    });
  }, [filteredQuestions]);

  // Resolve the solution to display for the currently selected learning cohort
  const displayedSolution: QuestionSolution | undefined =
    activeQuestion?.cohortSolutions?.[selectedCohort] || activeQuestion?.solution;

  const solveForCohort = async (q: PastQuestionItem, cohortId: LearningCohortId) => {
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
          action: "solve",
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
        selfHealed: Boolean(j.data?.selfHealed),
      };
      setSelectedCohort(cohortId);
      setActiveQuestion(updated);
      setQuestions((prev) => prev.map((item) => (item.id === q.id ? updated : item)));
      if (j.data?.selfHealed) {
        toast({
          title: "Self-Healed Explanation",
          description: "Sprout automatically upgraded this cohort explanation for higher clarity!",
        });
      }
    } catch {
      toast({ title: "Connection error", description: "Check network connection", variant: "destructive" });
    } finally {
      setSolving(false);
    }
  };

  const recordLearningSignal = async (
    correct: boolean,
    preferredCohort?: LearningCohortId,
    scorePercent?: number
  ) => {
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
          scorePercent,
          preferredCohort,
        }),
      });
      const j = await res.json();
      if (res.ok && j.ok && j.data?.profile) {
        setTelemetry(j.data.profile);
        toast({
          title: correct ? "Question Completed & Mastered!" : "Adaptive Algorithm Updated",
          description: correct
            ? `Exam readiness: ${j.data.profile.predictedExamReadiness}% • Click 'Next by Completion' to continue.`
            : "Sprout flagged this topic and formula for micro-step practice.",
        });
      }
    } catch {
      // Non-blocking telemetry
    } finally {
      setRecordingTelemetry(false);
    }
  };

  const handleJumpToRecommended = () => {
    const next = pickNextRecommendedQuestion(questions, telemetry || undefined);
    if (next) {
      setActiveQuestion(next);
      setShowHints(false);
      setShowTwinSolution(false);
      setHandwrittenReport(null);
      toast({
        title: "Adaptive Question Selected",
        description: `Topic: ${next.topic || "Core Syllabus"} (${next.year || "Past Exam"} Q${next.questionNumber || "1"})`,
      });
    }
  };

  const handleSnapFileSelect = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setSnapPreviewUrl(dataUrl);
      setHandwrittenReport(null);
    } catch {
      toast({ title: "Invalid image", description: "Please pick a clear JPEG or PNG photo.", variant: "destructive" });
    }
  };

  const handleGradeHandwritten = async () => {
    if (!activeQuestion) return;
    if (!snapPreviewUrl && !writtenWork.trim()) {
      toast({
        title: "Add your solution first",
        description: "Snap a photo of your paper work or type your steps below.",
        variant: "destructive",
      });
      return;
    }
    setGradingHandwritten(true);
    try {
      const dwellMs = Math.max(10_000, Date.now() - questionStartRef.current);
      const res = await fetch(`/api/classes/${classId}/past-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade_handwritten",
          questionId: activeQuestion.id,
          questionText: activeQuestion.questionText,
          topic: activeQuestion.topic || "Core Syllabus",
          maxMarks: activeQuestion.marks || 15,
          imageDataUrl: snapPreviewUrl || undefined,
          writtenWork: writtenWork.trim() || undefined,
          dwellMs,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setShowUpgradeModal(true);
          return;
        }
        toast({
          title: "Grading failed",
          description: j?.error?.message || "Please try again",
          variant: "destructive",
        });
        return;
      }
      if (j.data?.report) {
        setHandwrittenReport(j.data.report);
      }
      if (j.data?.telemetryProfile) {
        setTelemetry(j.data.telemetryProfile);
      }
      toast({
        title: `Marked: ${j.data?.report?.scoreAwarded ?? 0}/${j.data?.report?.maxMarks ?? 15}`,
        description: "Your completion and topic mastery have been updated.",
      });
    } catch {
      toast({ title: "Network error", description: "Check your connection and retry.", variant: "destructive" });
    } finally {
      setGradingHandwritten(false);
    }
  };

  const handleSubmitCbt = async () => {
    if (cbtPool.length === 0) return;
    setCbtSubmitted(true);
    let correctCount = 0;
    for (const item of cbtPool) {
      if (cbtAnswers[item.id] === item.correctIndex) {
        correctCount++;
      }
    }
    const scorePct = Math.round((correctCount / cbtPool.length) * 100);
    const activeItem = cbtPool[cbtIndex] || cbtPool[0];
    if (activeItem) {
      await fetch("/api/study/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          questionId: activeItem.id,
          topic: activeItem.topic,
          dwellMs: Math.max(15_000, Date.now() - questionStartRef.current),
          correct: scorePct >= 60,
          scorePercent: scorePct,
        }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok && j.data?.profile) setTelemetry(j.data.profile);
        })
        .catch(() => null);
    }
    toast({
      title: `CBT Score: ${correctCount}/${cbtPool.length} (${scorePct}%)`,
      description:
        scorePct >= 70
          ? "Strong CBT performance! Topic completion recorded."
          : "Review the explanations below for missed questions.",
    });
  };

  const handleTeacherUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      const payload =
        uploadTab === "bulk_scan"
          ? {
              mode: "bulk_scan" as const,
              year: newYear.trim() || "2024 Exam",
              topic: newTopic.trim() || "Core Syllabus",
              questionText: newText.trim(),
              examImageDataUrl: bulkScanImageUrl || undefined,
            }
          : {
              mode: "single" as const,
              year: newYear.trim() || "2024 Exam",
              questionNumber: newQNum.trim() || "1",
              topic: newTopic.trim() || "Core Syllabus",
              questionType: newType,
              marks: Number(newMarks) || 15,
              questionText: newText.trim(),
              options: newType === "objective" ? newOptions.map((o) => o.trim()).filter(Boolean) : undefined,
              correctIndex: newType === "objective" ? newCorrectIdx : undefined,
            };

      const res = await fetch(`/api/classes/${classId}/past-questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

      if (uploadTab === "bulk_scan" && Array.isArray(j.data?.items)) {
        const added: PastQuestionItem[] = j.data.items;
        setQuestions((prev) => [...added, ...prev]);
        if (added[0]) setActiveQuestion(added[0]);
        toast({
          title: `Extracted ${added.length} Exam Questions!`,
          description: "Questions have been categorized by topic and added to the class bank.",
        });
      } else {
        const created: PastQuestionItem = j.data;
        setQuestions((prev) => [created, ...prev]);
        setActiveQuestion(created);
        toast({ title: "Past question added", description: "Categorized under " + (created.topic || "Syllabus") });
      }
      setShowUploadModal(false);
      setNewText("");
      setBulkScanImageUrl(null);
    } catch {
      toast({ title: "Network error", description: "Try again shortly", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const peerMedianMs = activeQuestion?.peerMedianMs || DEFAULT_PEER_MEDIAN_MS;
  const isSlowerThanPeers = elapsedMs > peerMedianMs * 1.25;
  const totalCompletedCount = questions.filter((q) => completedIdsSet.has(q.id)).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5 p-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/classes/${classId}`}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {classTitle}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowShareModal(true)}
            className="text-xs font-semibold h-8"
          >
            <Share2 className="mr-1.5 h-3.5 w-3.5 text-brand-600" /> Share Readiness Card
          </Button>
          {canUpload && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUploadModal(true)}
              className="text-xs font-semibold h-8"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add / Scan Past Paper
            </Button>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-600 font-bold border border-brand-500/20 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {isSubscriber ? "Full Exam Pass Active" : "Free Preview Mode"}
          </span>
        </div>
      </div>

      {/* Course Header & 3 Exam Practice Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-bold text-brand-600 uppercase tracking-wider truncate">{classTitle}</span>
            {classDepartment && <span>• {classDepartment}</span>}
            {classInstitution && <span>• {classInstitution}</span>}
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-brand-600 shrink-0" />
            <span>Past Questions, CBT &amp; Handwritten Grader</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Categorized by course topic. Practice step-by-step theory, timed CBT objectives, or snap your handwritten paper solution for AI marking.
          </p>
        </div>

        {/* Mode Switcher Tabs — Responsive grid on mobile, inline pill bar on desktop */}
        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full md:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setPracticeMode("study")}
            className={cn(
              "text-[11px] sm:text-xs px-2 sm:px-3 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1",
              practiceMode === "study"
                ? "bg-brand-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Theory</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPracticeMode("cbt");
              setCbtSubmitted(false);
            }}
            className={cn(
              "text-[11px] sm:text-xs px-2 sm:px-3 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1",
              practiceMode === "cbt"
                ? "bg-brand-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CheckSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">CBT Mode</span>
          </button>
          <button
            type="button"
            onClick={() => setPracticeMode("handwritten")}
            className={cn(
              "text-[11px] sm:text-xs px-2 sm:px-3 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1",
              practiceMode === "handwritten"
                ? "bg-brand-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Camera className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Snap Work</span>
          </button>
        </div>
      </div>

      {/* TikTok / FYP-Style Personal Learning Telemetry & Completion Bar */}
      <div className="rounded-2xl border border-brand-500/25 bg-gradient-to-r from-brand-500/10 via-card to-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-12 shrink-0 flex items-center justify-center">
              <Sprout pose={isSlowerThanPeers ? "think" : "jump"} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1">
                  <Activity className="h-3 w-3" /> Adaptive FYP Algorithm
                </span>
                <span className="text-xs font-bold text-foreground">
                  Cohort: {LEARNING_COHORTS[selectedCohort].label}
                </span>
                <span className="text-xs text-muted-foreground">
                  • Completed {totalCompletedCount}/{questions.length} in this class
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {LEARNING_COHORTS[selectedCohort].description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
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
                {formatDurationSec(elapsedMs)}{" "}
                <span className="text-muted-foreground font-normal">
                  (Peer avg: {formatDurationSec(peerMedianMs)})
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

            <Button
              size="sm"
              variant="outline"
              onClick={handleJumpToRecommended}
              className="h-8 text-xs font-semibold border-brand-500/40 text-brand-700 dark:text-brand-300"
            >
              Next by Completion <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Topic Categorization Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
          <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mr-1">
            <Layers className="h-3 w-3 text-brand-600" /> Syllabus Topics:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTopicFilter("all")}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-lg border transition font-semibold",
              selectedTopicFilter === "all"
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-card hover:bg-slate-100 dark:hover:bg-slate-800 border-border text-muted-foreground"
            )}
          >
            All Topics ({totalCompletedCount}/{questions.length})
          </button>
          {topicsSummary.map((t) => {
            const active = selectedTopicFilter === t.topic;
            return (
              <button
                key={t.topic}
                type="button"
                onClick={() => setSelectedTopicFilter(t.topic)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-lg border transition flex items-center gap-1",
                  active
                    ? "bg-brand-600 text-white border-brand-600 font-bold"
                    : "bg-card hover:bg-slate-100 dark:hover:bg-slate-800 border-border text-muted-foreground"
                )}
              >
                <span>{t.topic}</span>
                <span className="opacity-80">
                  ({t.completed}/{t.total})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODE 2: CBT OBJECTIVE EXAM SIMULATOR                                  */}
      {/* ===================================================================== */}
      {practiceMode === "cbt" && (
        <Card className="p-6 border border-border shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white">
                  CBT Objective Simulator
                </span>
                <span
                  className={cn(
                    "text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1",
                    cbtFocusWarnings === 0
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  )}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Focus Lock: {cbtFocusWarnings === 0 ? "100% Integrity (0 Tab Switches)" : `${cbtFocusWarnings} Tab Switch${cbtFocusWarnings === 1 ? "" : "es"} Flagged`}
                </span>
              </div>
              <h2 className="text-lg font-extrabold text-foreground mt-1">
                Computer-Based Test Practice ({cbtPool.length} Questions)
              </h2>
              <p className="text-xs text-muted-foreground">
                Select the best option for each question, then submit to grade your accuracy by syllabus topic.
              </p>
            </div>

            {/* Question Palette */}
            <div className="flex flex-wrap items-center gap-1.5">
              {cbtPool.map((item, idx) => {
                const answered = cbtAnswers[item.id] !== undefined;
                const isCurrent = cbtIndex === idx;
                const isRight = cbtSubmitted && cbtAnswers[item.id] === item.correctIndex;
                const isWrong = cbtSubmitted && cbtAnswers[item.id] !== item.correctIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCbtIndex(idx)}
                    className={cn(
                      "h-8 w-8 rounded-lg text-xs font-bold border transition flex items-center justify-center",
                      isCurrent && "ring-2 ring-brand-600",
                      isRight
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : isWrong
                        ? "bg-rose-600 text-white border-rose-600"
                        : answered
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-slate-100 dark:bg-slate-800 border-border text-muted-foreground"
                    )}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {cbtPool[cbtIndex] ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-bold text-brand-600">
                  Question {cbtIndex + 1} of {cbtPool.length} • {cbtPool[cbtIndex].topic}
                </span>
                <span>{cbtPool[cbtIndex].year}</span>
              </div>

              <p className="text-sm sm:text-base font-semibold text-foreground leading-relaxed">
                {cbtPool[cbtIndex].stem}
              </p>

              <div className="grid grid-cols-1 gap-2.5">
                {cbtPool[cbtIndex].options.map((opt, oIdx) => {
                  const chosen = cbtAnswers[cbtPool[cbtIndex].id] === oIdx;
                  const isCorrectOpt = cbtPool[cbtIndex].correctIndex === oIdx;
                  const letter = String.fromCharCode(65 + oIdx);
                  return (
                    <button
                      key={oIdx}
                      type="button"
                      disabled={cbtSubmitted}
                      onClick={() =>
                        setCbtAnswers((prev) => ({
                          ...prev,
                          [cbtPool[cbtIndex].id]: oIdx,
                        }))
                      }
                      className={cn(
                        "p-3.5 rounded-xl border text-left text-xs sm:text-sm transition flex items-center justify-between gap-3",
                        cbtSubmitted && isCorrectOpt
                          ? "bg-emerald-500/15 border-emerald-600 text-emerald-900 dark:text-emerald-200 font-bold"
                          : cbtSubmitted && chosen && !isCorrectOpt
                          ? "bg-rose-500/15 border-rose-600 text-rose-900 dark:text-rose-200 font-semibold"
                          : chosen
                          ? "bg-brand-50 dark:bg-brand-950/40 border-brand-600 font-semibold ring-1 ring-brand-600"
                          : "bg-card hover:bg-slate-50 dark:hover:bg-slate-800/50 border-border"
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="h-6 w-6 rounded-md bg-slate-200/70 dark:bg-slate-800 font-bold flex items-center justify-center text-xs shrink-0">
                          {letter}
                        </span>
                        <span>{opt}</span>
                      </span>
                      {cbtSubmitted && isCorrectOpt && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      )}
                      {cbtSubmitted && chosen && !isCorrectOpt && (
                        <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {cbtSubmitted && (
                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                  <span className="font-bold text-blue-700 dark:text-blue-300 block">
                    Examiner Explanation:
                  </span>
                  <p className="text-foreground leading-relaxed">{cbtPool[cbtIndex].explanation}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cbtIndex === 0}
                  onClick={() => setCbtIndex((i) => Math.max(0, i - 1))}
                  className="text-xs"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {cbtIndex < cbtPool.length - 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCbtIndex((i) => Math.min(cbtPool.length - 1, i + 1))}
                      className="text-xs"
                    >
                      Next Question
                    </Button>
                  )}
                  {!cbtSubmitted ? (
                    <Button
                      size="sm"
                      onClick={() => void handleSubmitCbt()}
                      className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
                    >
                      <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Submit CBT Exam
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCbtAnswers({});
                        setCbtSubmitted(false);
                        setCbtIndex(0);
                      }}
                      className="text-xs font-semibold"
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retake CBT
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">
              No questions in this topic filter yet.
            </p>
          )}
        </Card>
      )}

      {/* ===================================================================== */}
      {/* MODE 1 & MODE 3: QUESTION BANK + STEP-BY-STEP OR HANDWRITTEN GRADER   */}
      {/* ===================================================================== */}
      {practiceMode !== "cbt" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Categorized Question Selector List */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
              Categorized Questions ({filteredQuestions.length})
            </h3>
            <div className="space-y-2 max-h-[68vh] overflow-y-auto pr-1">
              {filteredQuestions.map((q) => {
                const active = activeQuestion?.id === q.id;
                const isDone = completedIdsSet.has(q.id);
                const hasAnySolution = Boolean(
                  q.solution || (q.cohortSolutions && Object.keys(q.cohortSolutions).length > 0)
                );
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setActiveQuestion(q);
                      setShowHints(false);
                      setShowTwinSolution(false);
                      setHintsCount(0);
                      setHandwrittenReport(null);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition text-xs flex flex-col gap-1",
                      active
                        ? "bg-brand-50/80 dark:bg-brand-950/40 border-brand-600 ring-1 ring-brand-600 shadow-sm"
                        : "bg-card hover:bg-slate-50 dark:hover:bg-slate-800/50 border-border"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-brand-600">
                        {q.year || "Past Exam"} • Q{q.questionNumber || "1"}
                      </span>
                      <div className="flex items-center gap-1">
                        {isDone && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Done
                          </span>
                        )}
                        {!isDone && hasAnySolution && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 font-bold">
                            Cached
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {q.topic || "Core Syllabus"}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-muted-foreground capitalize">
                        {q.questionType || "theory"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-foreground/90 font-medium">{q.questionText}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Question Workspace */}
          <div className="md:col-span-2 space-y-4">
            {activeQuestion ? (
              <Card className="border border-border shadow-sm p-5 space-y-5">
                {/* Question Header & Statement */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-foreground">
                        {activeQuestion.year} — Q{activeQuestion.questionNumber}
                      </span>
                      <span className="text-xs font-bold text-brand-600">
                        {activeQuestion.topic || "Core Syllabus"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        [{activeQuestion.marks || 15} Marks]
                      </span>
                    </div>
                    {activeQuestion.cached && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Pre-stored cohort cache
                      </span>
                    )}
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-foreground leading-relaxed">
                    {activeQuestion.questionText}
                  </p>
                </div>

                {/* =========================================================== */}
                {/* HANDWRITTEN PAPER SNAP & AI GRADER WORKSPACE                */}
                {/* =========================================================== */}
                {practiceMode === "handwritten" ? (
                  <div className="space-y-4 pt-3 border-t">
                    <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-start gap-3">
                      <Camera className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <h4 className="font-bold text-foreground">
                          Solve on Paper & Snap Your Handwritten Work
                        </h4>
                        <p className="text-muted-foreground">
                          Write out your full derivation or calculation on paper, snap a clear photo (or type your workings below), and Sprout will mark your steps out of{" "}
                          <strong>{activeQuestion.marks || 15} marks</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        ref={snapFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => void handleSnapFileSelect(e.target.files?.[0])}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => snapFileInputRef.current?.click()}
                        className="text-xs font-semibold"
                      >
                        <Camera className="mr-1.5 h-4 w-4 text-brand-600" />
                        {snapPreviewUrl ? "Retake / Change Photo" : "Snap or Upload Handwritten Photo"}
                      </Button>
                      {snapPreviewUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSnapPreviewUrl(null)}
                          className="text-xs text-rose-600"
                        >
                          Remove Photo
                        </Button>
                      )}
                    </div>

                    {snapPreviewUrl && (
                      <div className="rounded-xl border border-border overflow-hidden bg-slate-950/5 max-h-64 flex items-center justify-center p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={snapPreviewUrl}
                          alt="Handwritten solution preview"
                          className="max-h-56 w-auto object-contain rounded-lg"
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Optional: Type or paste your rough workings / final answer
                      </label>
                      <textarea
                        value={writtenWork}
                        onChange={(e) => setWrittenWork(e.target.value)}
                        rows={3}
                        placeholder="You can also type your steps or equations here alongside (or instead of) a photo..."
                        className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => void handleGradeHandwritten()}
                      isLoading={gradingHandwritten}
                      className="w-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                    >
                      <Award className="mr-1.5 h-4 w-4" /> Mark My Solution ({activeQuestion.marks || 15} Marks)
                    </Button>

                    {/* Handwritten Grading Report */}
                    {handwrittenReport && (
                      <div className="space-y-4 pt-4 border-t animate-in fade-in duration-200">
                        <div className="p-4 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                              Chief Examiner Score
                            </span>
                            <h4 className="text-lg font-black text-foreground">
                              {handwrittenReport.scoreAwarded} / {handwrittenReport.maxMarks} Marks (
                              {handwrittenReport.scorePercent}%)
                            </h4>
                          </div>
                          <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-card border">
                            {handwrittenReport.verdict.replace("_", " ")}
                          </span>
                        </div>

                        {handwrittenReport.stepFeedback.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                              Step-by-Step Marking Breakdown
                            </h5>
                            {handwrittenReport.stepFeedback.map((fb, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-foreground">{fb.step}</span>
                                  <span
                                    className={cn(
                                      "text-[10px] font-extrabold uppercase px-2 py-0.5 rounded",
                                      fb.status === "correct"
                                        ? "bg-emerald-500/15 text-emerald-600"
                                        : fb.status === "partial"
                                        ? "bg-amber-500/15 text-amber-600"
                                        : "bg-rose-500/15 text-rose-600"
                                    )}
                                  >
                                    {fb.status}
                                  </span>
                                </div>
                                <p className="text-muted-foreground">{fb.comment}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                          <span className="font-bold text-blue-700 dark:text-blue-300 block">
                            Examiner Advice to Score 100%:
                          </span>
                          <p className="text-foreground leading-relaxed">{handwrittenReport.examinerAdvice}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* =========================================================== */
                  /* STEP-BY-STEP COHORT STUDY WORKSPACE                         */
                  /* =========================================================== */
                  <>
                    {/* Cohort Style Switcher */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
                      <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                        Cohort Style:
                      </span>
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
                              if (
                                activeQuestion &&
                                (activeQuestion.solution || activeQuestion.cohortSolutions)
                              ) {
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

                    {displayedSolution ? (
                      <div className="space-y-5 pt-2">
                        {displayedSolution.hints && displayedSolution.hints.length > 0 && (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-border">
                            <div className="flex items-center gap-2 text-xs">
                              <HelpCircle className="h-4 w-4 text-brand-600 shrink-0" />
                              {showHints ? (
                                <span className="text-foreground font-medium">
                                  {displayedSolution.hints.join(" • ")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  Want a progressive hint before reading every step?
                                </span>
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

                        {displayedSolution.keyPrinciple && (
                          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1.5">
                            <span className="text-xs font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                              <Lightbulb className="h-4 w-4" /> Core Concept (
                              {LEARNING_COHORTS[selectedCohort].shortLabel})
                            </span>
                            <p className="text-xs text-foreground leading-relaxed">
                              {displayedSolution.keyPrinciple}
                            </p>
                            {displayedSolution.formulas && displayedSolution.formulas.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {displayedSolution.formulas.map((f, i) => (
                                  <span
                                    key={i}
                                    className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-foreground break-all sm:break-words max-w-full"
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

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

                        {displayedSolution.finalAnswer && (
                          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                              Final Answer:
                            </span>
                            <span className="font-mono text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                              {displayedSolution.finalAnswer}
                            </span>
                          </div>
                        )}

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

                        <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            Did this cohort explanation click for you?
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
                                void recordLearningSignal(false, nextCohort, 45);
                                void solveForCohort(activeQuestion, nextCohort);
                              }}
                              className="text-xs h-8"
                            >
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Explain Differently
                            </Button>
                            <Button
                              size="sm"
                              disabled={recordingTelemetry}
                              onClick={() => void recordLearningSignal(true, selectedCohort, 95)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8"
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark Completed
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
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
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button
                            onClick={() => void solveForCohort(activeQuestion, selectedCohort)}
                            isLoading={solving}
                            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs"
                          >
                            <Sparkles className="mr-1.5 h-4 w-4" /> Reveal Step-by-Step Solution
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setPracticeMode("handwritten")}
                            className="text-xs font-semibold"
                          >
                            <Camera className="mr-1.5 h-4 w-4 text-brand-600" /> Solve on Paper & Snap
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
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

      {/* Teacher Single & Bulk Scanner Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <form
            onSubmit={handleTeacherUpload}
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Add or Scan Past Exam Questions</h3>
                <p className="text-xs text-muted-foreground">
                  Categorize by syllabus topic for Step-by-Step, CBT, and Handwritten practice.
                </p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setUploadTab("single")}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-lg font-semibold",
                    uploadTab === "single" ? "bg-brand-600 text-white" : "text-muted-foreground"
                  )}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setUploadTab("bulk_scan")}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1",
                    uploadTab === "bulk_scan" ? "bg-brand-600 text-white" : "text-muted-foreground"
                  )}
                >
                  <ScanLine className="h-3 w-3" /> Bulk Scan
                </button>
              </div>
            </div>

            {uploadTab === "bulk_scan" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Exam Year / Session
                    </label>
                    <Input value={newYear} onChange={(e) => setNewYear(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Default Syllabus Topic
                    </label>
                    <Input
                      value={newTopic}
                      onChange={(e) => setNewTopic(e.target.value)}
                      placeholder="e.g. Data Structures"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-dashed border-brand-500/40 bg-brand-500/5 space-y-2">
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const url = await compressImageFile(f);
                      setBulkScanImageUrl(url);
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Option 1: Snap / Upload Printed Exam Sheet Photo</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => bulkFileInputRef.current?.click()}
                      className="text-xs h-7"
                    >
                      <Camera className="mr-1.5 h-3.5 w-3.5" /> Choose Exam Photo
                    </Button>
                  </div>
                  {bulkScanImageUrl && (
                    <p className="text-[11px] text-emerald-600 font-semibold">
                      Exam sheet image attached and ready for AI extraction.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Option 2: Paste Raw Exam Paper Text (Multiple Questions)
                  </label>
                  <textarea
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    rows={5}
                    placeholder="Paste a full past exam paper here; Sprout will split and categorize every question automatically..."
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Year</label>
                    <Input value={newYear} onChange={(e) => setNewYear(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Q. No</label>
                    <Input value={newQNum} onChange={(e) => setNewQNum(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Marks</label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={newMarks}
                      onChange={(e) => setNewMarks(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Syllabus Topic
                    </label>
                    <Input
                      value={newTopic}
                      onChange={(e) => setNewTopic(e.target.value)}
                      placeholder="e.g. Laplace Transforms"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Question Format
                    </label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as PastQuestionFormat)}
                      className="w-full h-9 px-2.5 text-xs rounded-lg border border-border bg-card text-foreground"
                    >
                      <option value="theory">Theory / Essay</option>
                      <option value="objective">CBT Objective (Multiple Choice)</option>
                      <option value="calculation">Numerical Calculation</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Question Text
                  </label>
                  <textarea
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    rows={3}
                    required
                    placeholder="Type the examination question..."
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>

                {newType === "objective" && (
                  <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-border">
                    <label className="text-xs font-bold block">CBT Multiple-Choice Options (Select correct one)</label>
                    {newOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correctOpt"
                          checked={newCorrectIdx === idx}
                          onChange={() => setNewCorrectIdx(idx)}
                        />
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const next = [...newOptions];
                            next[idx] = e.target.value;
                            setNewOptions(next);
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                {uploadTab === "bulk_scan" ? "Extract & Save All Questions" : "Save Question"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* WhatsApp / Social Exam Readiness Share Modal */}
      <ReadinessShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        classTitle={classTitle}
        institution={classInstitution || user?.institution}
        department={classDepartment || user?.department}
        username={user?.username}
        telemetry={telemetry}
        completedCount={totalCompletedCount}
        totalCount={questions.length}
      />

      {/* Upgrade Modal for Free Users */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-14 shrink-0 flex items-center justify-center">
                <Sprout pose="wave" />
              </div>
              <div>
                <h3 className="text-base font-bold">Unlock All Past Questions, CBT & Paper Marking</h3>
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
                  30 days of full step-by-step past questions, CBT simulator, and handwritten paper snap grading.
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
