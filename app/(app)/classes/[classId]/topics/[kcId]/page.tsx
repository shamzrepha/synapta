"use client";

import React, { useState, useEffect, use, useRef } from "react";
import Link from "next/link";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import confetti from "canvas-confetti";
import {
  BookOpen,
  Cpu,
  Layers,
  HelpCircle,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCw,
  Zap,
  Users,
  Send,
} from "lucide-react";
import { formatPL, getMasteryStatus } from "@/lib/utils";
import { updateMastery } from "@/lib/bkt/engine";
import { LAB_REGISTRY, NoneLab } from "@/components/labs";

interface KcDetails {
  id: string;
  title: string;
  description: string;
  lessonMarkdown?: string;
  objectives?: string[];
  prerequisiteIds?: string[];
  lab?: { type: string; config?: Record<string, unknown> };
}

interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: string;
}

interface FlashcardItem {
  front: string;
  back: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
}

export default function TopicPage({
  params,
}: {
  params: Promise<{ classId: string; kcId: string }>;
}) {
  const { classId, kcId } = use(params);
  const { user, updateUser } = useUserStore();
  const { toast } = useToast();

  const [kc, setKc] = useState<KcDetails | null>(null);
  const [currentPL, setCurrentPL] = useState<number>(0.2);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"learn" | "lab" | "flashcards" | "quiz" | "tutor">("learn");

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizItem[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<number, boolean>>({});
  const [loadingQuiz, setLoadingQuiz] = useState(false);

  // Flashcards state
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);

  // Tutor chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreamingTutor, setIsStreamingTutor] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ignore = false;
    async function loadTopicData() {
      try {
        const res = await fetch(`/api/classes/${classId}`);
        const data = await res.json();
        if (!ignore && data.ok) {
          const found = (data.data.kcs as KcDetails[])?.find((k) => k.id === kcId);
          if (found) {
            setKc(found);
          }
          if (data.data.masteryMap?.[kcId] !== undefined) {
            setCurrentPL(data.data.masteryMap[kcId]);
          }
        }
      } catch {
        // Fallback demo data
        if (!ignore) {
          setKc({
            id: kcId,
            title: "Ohm's Law: Voltage, Current, and Power Dissipation",
            description: "Understand the linear V-I relationship and calculate electric power P = I^2 * R.",
            lessonMarkdown: `## 1. Physical Principles of Ohm's Law\n\nIn electric circuits, **Ohm's Law** describes how electric charge moves through resistive matter under potential difference:\n\n$$I = \\frac{V}{R}$$\n\nWhere:\n- $V$ is the electrical potential difference across the component, measured in Volts ($\\text{V}$)\n- $I$ is the resulting rate of charge flow, measured in Amperes ($\\text{A}$)\n- $R$ is the material resistance to current flow, measured in Ohms ($\\Omega$)\n\n### 2. Joule Heating & Electrical Power\nWhen current traverses an ohmic resistor, electric potential energy is converted to thermal energy (heat). The rate of energy dissipation is power:\n\n$$P = V \\cdot I = I^2 R = \\frac{V^2}{R}$$\n\nIf the power dissipated exceeds the resistor's safe wattage rating (e.g. $0.5\\text{ W}$), the resistor suffers thermal destruction.\n\n### 3. Key Laboratory Takeaways\n- Doubling voltage doubles current through a fixed resistor.\n- Doubling resistance halves current for a fixed voltage.\n- Current decreases linearly as resistance increases.`,
            objectives: [
              "State Ohm's Law and identify standard SI units",
              "Calculate current, voltage, and resistance in DC circuits",
              "Determine power dissipation to prevent component burnout",
            ],
            prerequisiteIds: [],
            lab: { type: "ohms_law", config: { targetCurrent: 0.12, maxPower: 1.5 } },
          });
          setCurrentPL(0.628);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadTopicData();
    return () => {
      ignore = true;
    };
  }, [classId, kcId]);

  // Load Quiz
  const handleLoadQuiz = async () => {
    setLoadingQuiz(true);
    try {
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, kcId, count: 4 }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.data?.questions)) {
        setQuizQuestions(data.data.questions);
        setSelectedAnswers({});
        setSubmittedAnswers({});
      } else {
        loadFallbackQuiz();
      }
    } catch {
      loadFallbackQuiz();
    } finally {
      setLoadingQuiz(false);
    }
  };

  function loadFallbackQuiz() {
    setQuizQuestions([
      {
        question: "If a 12V voltage source is connected across a 100-ohm resistor, what current flows through the circuit?",
        options: ["0.12 A (120 mA)", "1.2 A", "0.012 A", "1200 A"],
        correctIndex: 0,
        explanation: "By Ohm's Law: I = V / R = 12 / 100 = 0.12 A (120 mA).",
        difficulty: "easy",
      },
      {
        question: "A resistor with R = 50 ohms carries a current of 0.2 A. What is the power dissipated?",
        options: ["10 W", "2.0 W", "0.4 W", "5 W"],
        correctIndex: 1,
        explanation: "Power P = I^2 * R = (0.2)^2 * 50 = 0.04 * 50 = 2.0 W.",
        difficulty: "medium",
      },
      {
        question: "What happens to the power dissipation in a resistor if the applied voltage is doubled while resistance remains constant?",
        options: ["Power remains unchanged", "Power doubles (2x)", "Power quadruples (4x)", "Power halves (0.5x)"],
        correctIndex: 2,
        explanation: "Since P = V^2 / R, doubling V results in (2V)^2 / R = 4 * (V^2 / R), quadrupling the power.",
        difficulty: "hard",
      },
    ]);
  }

  // Submit Quiz Question Evidence
  const handleSubmitQuizAnswer = async (qIndex: number) => {
    const chosen = selectedAnswers[qIndex];
    if (chosen === undefined) return;

    const question = quizQuestions[qIndex];
    const isCorrect = chosen === question.correctIndex;

    setSubmittedAnswers((prev) => ({ ...prev, [qIndex]: isCorrect }));

    // Post to transactional BKT evidence route
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          kcId,
          activity: "quiz",
          correct: isCorrect,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const { pLAfter, xpGained, totalXp, masteredFirstTime } = data.data;
        setCurrentPL(pLAfter);
        if (user) updateUser({ xp: totalXp });

        if (masteredFirstTime) {
          confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
          toast({
            title: "🎉 MASTERY ACHIEVED!",
            description: "You crossed 95% mastery on this concept! +100 Bonus XP awarded!",
            variant: "success",
          });
        } else {
          toast({
            title: isCorrect ? `Correct! (+${xpGained} XP)` : "Incorrect (+1 XP)",
            description: `Cognitive Twin mastery updated to ${(pLAfter * 100).toFixed(1)}%.`,
            variant: isCorrect ? "success" : "destructive",
          });
        }
      }
    } catch {
      // Local fallback
      const prev = currentPL;
      const next = updateMastery(prev, isCorrect, { pT: 0.15, pG: 0.2, pS: 0.1 }, "quiz");
      setCurrentPL(next);
      if (next >= 0.95 && prev < 0.95) {
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      }
    }
  };

  // Load Flashcards
  const handleLoadFlashcards = async () => {
    setLoadingCards(true);
    try {
      const res = await fetch("/api/ai/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, kcId, count: 6 }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.data?.cards)) {
        setFlashcards(data.data.cards);
        setCurrentCardIndex(0);
        setIsFlipped(false);
      } else {
        loadFallbackCards();
      }
    } catch {
      loadFallbackCards();
    } finally {
      setLoadingCards(false);
    }
  };

  function loadFallbackCards() {
    setFlashcards([
      { front: "What is Ohm's Law expressed in terms of current I?", back: "I = V / R (Current equals Voltage divided by Resistance)" },
      { front: "What is the formula for electric power in terms of I and R?", back: "P = I^2 * R" },
      { front: "What is the SI unit of electrical resistance?", back: "Ohm (symbol: Ω)" },
      { front: "If current I = 0.5 A and R = 100 Ω, what is the voltage V?", back: "V = I * R = 0.5 * 100 = 50 Volts" },
    ]);
    setCurrentCardIndex(0);
    setIsFlipped(false);
  }

  // Submit Flashcard Evidence
  const handleFlashcardFeedback = async (known: boolean) => {
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          kcId,
          activity: "flashcard",
          correct: known,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurrentPL(data.data.pLAfter);
        if (user) updateUser({ xp: data.data.totalXp });
        if (data.data.masteredFirstTime) {
          confetti({ particleCount: 100, spread: 60 });
        }
      }
    } catch {
      const next = updateMastery(currentPL, known, { pT: 0.15, pG: 0.2, pS: 0.1 }, "flashcard");
      setCurrentPL(next);
    }

    // Move to next card
    setIsFlipped(false);
    if (currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
    } else {
      toast({ title: "Deck Complete!", description: "You have reviewed all active flashcards.", variant: "success" });
    }
  };

  // Streaming Socratic Tutor Send
  const handleSendTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isStreamingTutor) return;

    const userText = inputMessage.trim();
    setInputMessage("");

    const newMsg: ChatMessage = { id: Math.random().toString(), role: "user", text: userText };
    setMessages((prev) => [...prev, newMsg]);

    const modelMsgId = Math.random().toString();
    setMessages((prev) => [...prev, { id: modelMsgId, role: "model", text: "" }]);
    setIsStreamingTutor(true);

    try {
      const response = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          kcId,
          message: userText,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to connect to AI Tutor");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === modelMsgId ? { ...m, text: accumulated } : m))
          );
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === modelMsgId
            ? {
                ...m,
                text: "To solve this Socratic question, notice the ratio $I = \\frac{V}{R}$. What happens to $I$ when you increase the denominator $R$?",
              }
            : m
        )
      );
    } finally {
      setIsStreamingTutor(false);
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (!kc) {
    return (
      <div className="text-center py-20 space-y-4">
        <h2 className="text-2xl font-bold">Knowledge Component Not Found</h2>
        <Link href={`/classes/${classId}`}>
          <Button>Back to Syllabus</Button>
        </Link>
      </div>
    );
  }

  const masteryStatus = getMasteryStatus(currentPL);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href={`/classes/${classId}`} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Class Syllabus
      </Link>

      {/* Main Two-Column Layout: Left Tools (Tabs) & Right Sticky Cognitive Twin Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Column: Interactive Tools (Learn, Lab, Cards, Quiz, AI) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Header Info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">Knowledge Component</Badge>
              {kc.lab && kc.lab.type !== "none" && (
                <Badge variant="amber" className="text-xs">
                  In-Situ Simulation Lab Included
                </Badge>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {kc.title}
            </h1>
            <p className="text-xs text-slate-500 mt-1">{kc.description}</p>
          </div>

          {/* Tool Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("learn")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all ${
                activeTab === "learn"
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
              }`}
            >
              <BookOpen className="h-4 w-4" /> Learn
            </button>

            <button
              onClick={() => setActiveTab("lab")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all ${
                activeTab === "lab"
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
              }`}
            >
              <Cpu className="h-4 w-4" /> In-Situ Lab
            </button>

            <button
              onClick={() => {
                setActiveTab("flashcards");
                if (flashcards.length === 0) handleLoadFlashcards();
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all ${
                activeTab === "flashcards"
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
              }`}
            >
              <Layers className="h-4 w-4" /> Flashcards
            </button>

            <button
              onClick={() => {
                setActiveTab("quiz");
                if (quizQuestions.length === 0) handleLoadQuiz();
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all ${
                activeTab === "quiz"
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
              }`}
            >
              <HelpCircle className="h-4 w-4" /> Quiz
            </button>

            <button
              onClick={() => setActiveTab("tutor")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all ${
                activeTab === "tutor"
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
              }`}
            >
              <MessageSquare className="h-4 w-4" /> Ask AI Tutor
            </button>
          </div>

          {/* TAB 1: LEARN (Markdown + LaTeX) */}
          {activeTab === "learn" && (
            <div className="space-y-4">
              <Card className="p-6 md:p-8">
                <MarkdownRenderer content={kc.lessonMarkdown || kc.description} />
              </Card>

              {kc.objectives && kc.objectives.length > 0 && (
                <Card className="p-5">
                  <h3 className="font-bold text-sm mb-2 text-slate-900 dark:text-slate-100">
                    Target Mastery Objectives
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    {kc.objectives.map((obj, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                        <span>{obj}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}

          {/* TAB 2: LAB (Virtual Simulation Container) */}
          {activeTab === "lab" && (
            <Card className="p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-amber-500" />
                  <div>
                    <h3 className="font-bold text-base">In-Situ Interactive Apparatus</h3>
                    <p className="text-xs text-slate-500">
                      Simulation Type:{" "}
                      <span className="font-mono text-teal-600 dark:text-teal-400">
                        {kc.lab?.type || "none"}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {(() => {
                const labType = kc.lab?.type || "none";
                const LabComponent = LAB_REGISTRY[labType] || NoneLab;

                return (
                  <LabComponent
                    config={kc.lab?.config as Record<string, string | number> | undefined}
                    onComplete={async (result) => {
                      try {
                        const res = await fetch("/api/evidence", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            classId,
                            kcId,
                            activity: "lab",
                            correct: result.success,
                          }),
                        });
                        const data = await res.json();
                        if (data.ok) {
                          setCurrentPL(data.data.pLAfter);
                          if (user) updateUser({ xp: data.data.totalXp });
                          toast({
                            title: "🎉 Lab Completed! (+30 XP)",
                            description: `Mastery jumped to ${(data.data.pLAfter * 100).toFixed(1)}%! ${result.detail}`,
                            variant: "success",
                          });
                          if (data.data.crossedMasteryFirstTime) {
                            confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
                          }
                        } else if (data.error?.code === "LAB_RATE_LIMITED") {
                          toast({
                            title: "⏳ Rate-Limited",
                            description: data.error.message,
                            variant: "destructive",
                          });
                        } else {
                          toast({
                            title: "Submission Notice",
                            description: data.error?.message || "Failed to record lab completion",
                            variant: "destructive",
                          });
                        }
                      } catch {
                        toast({
                          title: "Offline Evidence Recorded",
                          description: "Simulated offline lab completion.",
                          variant: "default",
                        });
                      }
                    }}
                  />
                );
              })()}
            </Card>
          )}

          {/* TAB 3: FLASHCARDS */}
          {activeTab === "flashcards" && (
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  <h3 className="font-bold text-base">Active Recall Flashcards</h3>
                </div>
                <Button size="sm" variant="outline" onClick={handleLoadFlashcards} isLoading={loadingCards} className="text-xs">
                  <RotateCw className="h-3.5 w-3.5 mr-1" /> New AI Deck
                </Button>
              </div>

              {loadingCards ? (
                <Skeleton className="h-48 w-full rounded-2xl" />
              ) : flashcards.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-xs text-slate-500">No flashcards loaded yet.</p>
                  <Button size="sm" onClick={handleLoadFlashcards}>Generate AI Flashcards</Button>
                </div>
              ) : (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Card {currentCardIndex + 1} of {flashcards.length}</span>
                    <span>Click card to flip</span>
                  </div>

                  {/* Flip Card Container */}
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="cursor-pointer min-h-[200px] rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-center items-center text-center shadow-md hover:border-teal-500 transition-all select-none"
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">
                      {isFlipped ? "Answer (Back)" : "Prompt (Front)"}
                    </span>
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                      {isFlipped ? flashcards[currentCardIndex].back : flashcards[currentCardIndex].front}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:border-rose-900 text-xs"
                      onClick={() => handleFlashcardFeedback(false)}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" /> Still Learning (Incorrect)
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      onClick={() => handleFlashcardFeedback(true)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> I Knew It (+5 XP)
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB 4: QUIZ */}
          {activeTab === "quiz" && (
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  <h3 className="font-bold text-base">Concept Quiz & Assessment</h3>
                </div>
                <Button size="sm" variant="outline" onClick={handleLoadQuiz} isLoading={loadingQuiz} className="text-xs">
                  <RotateCw className="h-3.5 w-3.5 mr-1" /> New AI Quiz
                </Button>
              </div>

              {loadingQuiz ? (
                <div className="space-y-4">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : quizQuestions.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-xs text-slate-500">No quiz questions generated yet.</p>
                  <Button size="sm" onClick={handleLoadQuiz}>Generate Quiz</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {quizQuestions.map((q, qIndex) => {
                    const isSubmitted = submittedAnswers[qIndex] !== undefined;
                    const isCorrect = submittedAnswers[qIndex] === true;

                    return (
                      <div
                        key={qIndex}
                        className={`p-5 rounded-2xl border transition-all ${
                          isSubmitted
                            ? isCorrect
                              ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20"
                              : "border-rose-500/40 bg-rose-50/50 dark:bg-rose-950/20"
                            : "border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {qIndex + 1}. {q.question}
                          </h4>
                          {q.difficulty && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {q.difficulty}
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-2 mb-4">
                          {q.options.map((opt, optIndex) => {
                            const selected = selectedAnswers[qIndex] === optIndex;
                            const isTheRightAnswer = optIndex === q.correctIndex;

                            return (
                              <button
                                key={optIndex}
                                type="button"
                                disabled={isSubmitted}
                                onClick={() => setSelectedAnswers((prev) => ({ ...prev, [qIndex]: optIndex }))}
                                className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-center justify-between ${
                                  isSubmitted
                                    ? isTheRightAnswer
                                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 font-semibold"
                                      : selected
                                      ? "border-rose-500 bg-rose-500/10 text-rose-950 dark:text-rose-200"
                                      : "border-slate-200 dark:border-slate-800 opacity-60"
                                    : selected
                                    ? "border-teal-500 bg-teal-500/10 text-teal-950 dark:text-teal-200 ring-2 ring-teal-500/20 font-semibold"
                                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                }`}
                              >
                                <span>{opt}</span>
                                {isSubmitted && isTheRightAnswer && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 ml-2" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {!isSubmitted ? (
                          <Button
                            size="sm"
                            className="text-xs"
                            disabled={selectedAnswers[qIndex] === undefined}
                            onClick={() => handleSubmitQuizAnswer(qIndex)}
                          >
                            Submit Answer
                          </Button>
                        ) : (
                          <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs">
                            <span className="font-bold block mb-1">
                              {isCorrect ? "✓ Correct!" : "✗ Incorrect"}
                            </span>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                              {q.explanation}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* TAB 5: ASK AI TUTOR (Grounded Socratic Chat Stream) */}
          {activeTab === "tutor" && (
            <Card className="flex flex-col h-[560px]">
              <CardHeader className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                      AI
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">Socratic AI Tutor</h3>
                      <p className="text-[10px] text-slate-500">
                        Grounded strictly in: {kc.title}
                      </p>
                    </div>
                  </div>
                  <Badge variant="default" className="text-[10px]">
                    Adaptive to P(L) = {formatPL(currentPL)}
                  </Badge>
                </div>
              </CardHeader>

              {/* Chat Message Scroll */}
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-12 space-y-3">
                    <MessageSquare className="h-10 w-10 text-teal-500/40 mx-auto" />
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Ask any question about this lesson. I will guide you Socratically with conceptual hints and physical intuition!
                    </p>
                  </div>
                )}

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                        m.role === "user"
                          ? "bg-teal-600 text-white rounded-br-sm"
                          : "bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100 rounded-bl-sm border border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      {m.role === "model" ? (
                        <MarkdownRenderer content={m.text || "Thinking..."} />
                      ) : (
                        <p>{m.text}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </CardContent>

              {/* Message Input Form */}
              <form
                onSubmit={handleSendTutor}
                className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0 bg-white dark:bg-slate-950"
              >
                <Input
                  type="text"
                  placeholder="Ask a question about this topic..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isStreamingTutor}
                  className="text-xs"
                />
                <Button type="submit" size="icon" disabled={!inputMessage.trim() || isStreamingTutor}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </Card>
          )}
        </div>

        {/* Right Column: Sticky Cognitive Twin Live Card */}
        <div className="lg:col-span-1 sticky top-20 space-y-4">
          <Card className="border-teal-500/30 shadow-lg">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider block">
                Cognitive Digital Twin
              </span>
              <CardTitle className="text-base font-bold">Concept Mastery State</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-slate-500">Bayesian Posterior P(L):</span>
                  <Badge className={`text-xs ${masteryStatus.colorClass}`}>
                    {masteryStatus.label} ({formatPL(currentPL)})
                  </Badge>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
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

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-teal-500" /> Topic XP Earned:</span>
                  <strong className="text-slate-900 dark:text-slate-100">{user?.xp ?? 450} XP</strong>
                </div>
                <div className="flex justify-between">
                  <span>Mastery Threshold:</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">95.0%</strong>
                </div>
              </div>

              {/* Intervention recommendation if struggling */}
              {currentPL < 0.40 && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-200 text-xs space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-rose-500" /> Peer Study Recommended
                  </p>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    Your mastery is below 40%. Join a Peer Lounge to study with a student who has mastered this concept.
                  </p>
                  <Link href="/lounge" className="block pt-1">
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      Find Peer Study Match
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
