"use client";

import { OfflineDownloadButton } from "@/components/offline/download-button";
import { usePrefs } from "@/components/settings/use-prefs";
import { languageInfo } from "@/lib/i18n/languages";
import React, { useState, useEffect, use, useRef, useCallback } from "react";
import Link from "next/link";
import { TopicLabs } from "@/components/studio/topic-labs";
import { StepVideos } from "@/components/studio/videos";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import confetti from "canvas-confetti";
import {
  BookOpen,
  Gamepad2,
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
  Sparkles,
  Wand2,
  Cpu, Wrench, PlayCircle, ShoppingCart } from "lucide-react";
import { formatPL, getMasteryStatus, cn } from "@/lib/utils";
import { LAB_REGISTRY } from "@/components/labs";
import { AiSimulation } from "@/components/labs/ai-simulation";
import { PiecesLab } from "@/components/labs/pieces-lab";
import { RichInline } from "@/components/markdown/rich-inline";
import { QuizPlayer } from "@/components/quiz/quiz-player";
import { ProveIt } from "@/components/labs/prove-it";
import { AudioLesson } from "@/components/lesson/audio-lesson";
import { InteractiveNote } from "@/components/lesson/interactive-note";
import { PublishBar } from "@/components/lesson/publish-bar";
import { LanguagePreview } from "@/components/lesson/language-preview";
import { PracticeBankTools } from "@/components/lesson/practice-bank-tools";
import { ReadAloud } from "@/components/ui/read-aloud";
import { ShareButton, SaveButton } from "@/components/social/share-button";
import { TeachPanel } from "@/components/teach/teach-panel";
import { StudyProfileCard } from "@/components/study/profile-card";
import { resolveProfile, type StudyProfile } from "@/lib/study/profile";

interface KcDetails {
  id: string;
  title: string;
  description: string;
  lessonMarkdown?: string;
  objectives?: string[];
  prerequisiteIds?: string[];
  lab?: { type: string; config?: Record<string, unknown> };
  /** what this topic needs (set by AI or the teacher); older topics are guessed from their words */
  studyProfile?: unknown;
  labs?: unknown;
  /** what the teacher has published (teachers also see drafts) */
  published?: PublishState;
}

type PublishState = Record<"lesson" | "audio" | "simulation" | "practice", boolean>;

interface FlashcardItem {
  front: string;
  back: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  isError?: boolean;
}

type Tab = "learn" | "teach" | "pieces" | "simulate" | "build" | "flashcards" | "quiz" | "prove" | "tutor";

const THIN_LESSON_CHARS = 600;
const TUTOR_STARTERS = [
  "Explain this topic like I'm new to it",
  "Give me a real-world example",
  "What's the most common mistake here?",
  "Quiz me with one question",
];

const TAB_HINT: Record<Tab, string> = {
  learn: "Read the lesson, or press play to listen to it as a short podcast.",
  teach: "Watch and play with an animated lesson: change the numbers and see the idea move. Press Play lesson to have it explained step by step.",
  pieces: "Work through the topic one idea at a time: each piece has its own experiment and a check question.",
  simulate: "Play with an interactive model: change things on screen and watch what happens.",
  build: "See a finished, working build for this topic: open it, read the code, run it and change it to see what happens. Then try Prove it to rebuild it yourself.",
  flashcards: "Quick flashcards to remember the key points.",
  quiz: "Answer a few questions. Your answers update your mastery score, and wrong ones go to your review list.",
  prove: "Rebuild it yourself from an empty bench: pick the parts, place them, wire them and program them. The Studio checks each step.",
  tutor: "Ask the AI anything about this topic.",
};

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
  const [attempts, setAttempts] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  // Everyone reads the topic in their language. A teacher can switch to the original (what they edit and publish).
  const [prefs] = usePrefs();
  const [showOriginal, setShowOriginal] = useState(false);
  const viewLang = prefs.language !== "en" && !showOriginal ? prefs.language : null;
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("learn");
  // Deep link: ?tab=build or ?tab=prove (lab notifications, and the Back button inside a lab)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "build" || t === "prove" || t === "teach" || t === "quiz" || t === "flashcards" || t === "simulate" || t === "pieces" || t === "tutor") {
      const h = setTimeout(() => setActiveTab(t), 0);
      return () => clearTimeout(h);
    }
  }, []);

  // A topic nobody has classified yet: the teacher's first visit lets AI decide what it needs (once)
  const classifiedRef = useRef(false);
  useEffect(() => {
    if (!canManage || !kc || kc.studyProfile || classifiedRef.current) return;
    classifiedRef.current = true;
    fetch(`/api/classes/${classId}/kcs/${kcId}/profile`, { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setKc((prev) => (prev ? { ...prev, studyProfile: j.data.profile } : prev));
      })
      .catch(() => null);
  }, [canManage, kc, classId, kcId]);

  // Lesson generation
  const [lessonBusy, setLessonBusy] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonInstructions, setLessonInstructions] = useState("");
  const [showLessonEditor, setShowLessonEditor] = useState(false);
  const autoLessonTried = useRef(false);

  // Classic built-in lab toggle
  const [showClassicLab, setShowClassicLab] = useState(false);

  // Flashcards state
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [deckDone, setDeckDone] = useState(false);

  // Tutor chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreamingTutor, setIsStreamingTutor] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const applyEvidenceUpdate = useCallback(
    (update: { pLAfter?: number; totalXp?: number; streakDays?: number }) => {
      if (typeof update.pLAfter === "number") {
        setCurrentPL(update.pLAfter);
        setAttempts((a) => a + 1);
      }
      if (user) {
        const patch: { xp?: number; streakDays?: number } = {};
        if (typeof update.totalXp === "number") patch.xp = update.totalXp;
        if (typeof update.streakDays === "number") patch.streakDays = update.streakDays;
        if (Object.keys(patch).length > 0) updateUser(patch);
      }
    },
    [user, updateUser]
  );

  const loadTopicData = useCallback(async () => {
    try {
      // ?kc= asks for this topic's full lecture note in the student's language
      const res = await fetch(`/api/classes/${classId}?kc=${encodeURIComponent(kcId)}${viewLang ? `&lang=${viewLang}` : ""}`);
      const data = await res.json();
      if (data.ok) {
        const found = (data.data.kcs as KcDetails[])?.find((k) => k.id === kcId);
        if (found) setKc(found);
        if (data.data.masteryMap?.[kcId] !== undefined) setCurrentPL(data.data.masteryMap[kcId]);
        if (data.data.attemptsMap?.[kcId] !== undefined) setAttempts(data.data.attemptsMap[kcId]);
        setCanManage(!!data.data.isOwner || data.data.role === "owner" || data.data.role === "admin");
        setIsEnrolled(data.data.enrollmentStatus === "active");
        return found as KcDetails | undefined;
      }
    } catch {
      // empty state handles it
    } finally {
      setLoading(false);
    }
    return undefined;
  }, [classId, kcId, viewLang]);

  useEffect(() => {
    loadTopicData();
  }, [loadTopicData]);

  // Write (or rewrite) the full lesson. Topics fresh out of the class builder only have a stub.
  const generateLesson = useCallback(
    async (opts: { regenerate?: boolean } = {}) => {
      setLessonBusy(true);
      setLessonError(null);
      try {
        const res = await fetch(`/api/classes/${classId}/kcs/${kcId}/lesson`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            regenerate: !!opts.regenerate,
            instructions: lessonInstructions.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setKc((prev) => (prev ? { ...prev, lessonMarkdown: data.data.lessonMarkdown } : prev));
          setShowLessonEditor(false);
        } else if (data.error?.code === "LESSON_GENERATING" || data.error?.code === "LESSON_EXISTS") {
          // Another learner triggered it a moment ago: wait for it to land
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 6000));
            const updated = await loadTopicData();
            if (updated && (updated.lessonMarkdown || "").length >= THIN_LESSON_CHARS) break;
          }
        } else {
          setLessonError(data.error?.message || "Couldn't write the lesson right now.");
        }
      } catch {
        setLessonError("Network error while writing the lesson.");
      } finally {
        setLessonBusy(false);
      }
    },
    [classId, kcId, lessonInstructions, loadTopicData]
  );

  const lessonIsThin = !kc?.lessonMarkdown || kc.lessonMarkdown.trim().length < THIN_LESSON_CHARS;

  useEffect(() => {
    if (!kc || autoLessonTried.current) return;
    // Only the teacher writes lessons; students wait for the published version
    if (lessonIsThin && canManage) {
      autoLessonTried.current = true;
      generateLesson();
    }
  }, [kc, lessonIsThin, canManage, generateLesson]);

  // Flashcards
  const handleLoadFlashcards = async () => {
    setLoadingCards(true);
    setCardsError(null);
    try {
      // The first deck on a topic prepares its ~40-card bank; others wait for it
      for (let attempt = 0; attempt < 24; attempt++) {
        const res = await fetch(viewLang ? `/api/ai/flashcards?lang=${viewLang}` : "/api/ai/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId, kcId, count: 10 }),
        });
        const data = await res.json().catch(() => null);
        if (data?.ok && Array.isArray(data.data?.cards) && data.data.cards.length > 0) {
          setFlashcards(data.data.cards);
          setCurrentCardIndex(0);
          setIsFlipped(false);
          setDeckDone(false);
          return;
        }
        if (data?.error?.code === "BANK_GENERATING") {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        setCardsError(data?.error?.message || "Couldn't load flashcards right now.");
        return;
      }
      setCardsError("Still preparing flashcards for this topic. Please try again in a minute.");
    } catch {
      setCardsError("Network error while loading flashcards.");
    } finally {
      setLoadingCards(false);
    }
  };

  const handleFlashcardFeedback = async (known: boolean) => {
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, kcId, activity: "flashcard", correct: known }),
      });
      const data = await res.json();
      if (data.ok) {
        applyEvidenceUpdate({ pLAfter: data.data.pLAfter, totalXp: data.data.totalXp, streakDays: data.data.streakDays });
        if (data.data.crossedMasteryFirstTime) confetti({ particleCount: 100, spread: 60 });
      }
    } catch {
      // Practice still continues; mastery just isn't recorded for this card
    }

    setIsFlipped(false);
    if (currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
    } else {
      setDeckDone(true);
    }
  };

  // Tutor (sends the conversation so far so follow-up questions make sense)
  const sendTutor = async (text: string) => {
    const userText = text.trim();
    if (!userText || isStreamingTutor) return;
    setInputMessage("");

    const history = messages
      .filter((m) => !m.isError && m.text)
      .slice(-12)
      .map((m) => ({ role: m.role, parts: m.text }));

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: userText };
    const modelMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: modelMsgId, role: "model", text: "" }]);
    setIsStreamingTutor(true);

    try {
      const response = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, kcId, message: userText, history }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error?.message || "The tutor is unavailable right now.");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setMessages((prev) => prev.map((m) => (m.id === modelMsgId ? { ...m, text: accumulated } : m)));
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === modelMsgId
            ? { ...m, isError: true, text: err instanceof Error ? err.message : "The tutor is unavailable right now." }
            : m
        )
      );
    } finally {
      setIsStreamingTutor(false);
    }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

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
        <h2 className="text-2xl font-bold">Topic not found</h2>
        <Link href={`/classes/${classId}`}>
          <Button>Back to class</Button>
        </Link>
      </div>
    );
  }

  const pub: PublishState = kc.published ?? { lesson: true, audio: true, simulation: true, practice: true };
  const notPublished = (what: string) => (
    <Card className="p-8 text-center space-y-1">
      <p className="text-3xl" aria-hidden>🕓</p>
      <p className="font-bold">Not published yet</p>
      <p className="text-sm text-slate-500">Your teacher is still preparing the {what}. You&apos;ll get a notification when it&apos;s ready.</p>
    </Card>
  );
  const masteryStatus = getMasteryStatus(currentPL, attempts);
  const ClassicLab = kc.lab && kc.lab.type !== "none" ? LAB_REGISTRY[kc.lab.type] : undefined;

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; step?: number; onOpen?: () => void }> = [
    { key: "learn", label: "Read & listen", step: 1, icon: <BookOpen className="h-4 w-4" /> },
    { key: "teach", label: "Interactive lesson", step: 2, icon: <PlayCircle className="h-4 w-4" /> },
    { key: "pieces", label: "Piece by piece", icon: <Layers className="h-4 w-4" /> },
    { key: "simulate", label: "Simulation", step: 2, icon: <Gamepad2 className="h-4 w-4" /> },
    {
      key: "flashcards",
      label: "Flashcards",
      step: 3,
      icon: <Layers className="h-4 w-4" />,
      onOpen: () => {
        if (flashcards.length === 0 && !loadingCards) handleLoadFlashcards();
      },
    },
    { key: "quiz", label: "Quiz", step: 4, icon: <HelpCircle className="h-4 w-4" /> },
    { key: "prove", label: "Prove it", step: 5, icon: <ShoppingCart className="h-4 w-4" /> },
    { key: "build", label: "Build & test", icon: <Wrench className="h-4 w-4" /> },
    { key: "tutor", label: "AI Tutor", icon: <MessageSquare className="h-4 w-4" /> },
  ];
  const profile = resolveProfile(kc);
  const shownKeys: Record<Tab, boolean> = {
    learn: true,
    teach: profile.needs.animation,
    pieces: profile.needs.simulation && (kc.objectives?.length ?? 0) > 1,
    simulate: profile.needs.simulation,
    flashcards: profile.needs.flashcards,
    quiz: profile.needs.practice,
    prove: profile.needs.prove,
    build: profile.needs.build,
    tutor: profile.needs.tutor,
  };
  const visibleTabs = tabs.filter((t) => shownKeys[t.key]).map((t, i, all) => (t.step ? { ...t, step: all.slice(0, i + 1).filter((x) => x.step).length } : t));
  const stepTabs = visibleTabs.filter((t) => t.step);
  const stepNow = stepTabs.findIndex((t) => t.key === activeTab);
  // a deep link to a tab this topic doesn't have lands on Read & listen
  const shownTab: Tab = shownKeys[activeTab] ? activeTab : "learn";
  const nextStep = stepNow >= 0 ? stepTabs[stepNow + 1] : undefined;

  return (
    <div className="space-y-6">
      <Link
        href={`/classes/${classId}`}
        className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to class
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-3 space-y-4 min-w-0">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {kc.title}
            </h1>
            {kc.description && <p className="text-sm text-slate-500 mt-1">{kc.description}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <ShareButton item={{ type: "topic", id: `${classId}_${kcId}`, title: kc.title, subtitle: "Lesson, simulation & quiz", href: `/classes/${classId}/topics/${kcId}`, emoji: "📚" }} />
              <SaveButton item={{ type: "topic", id: `${classId}_${kcId}`, title: kc.title, subtitle: "Topic", href: `/classes/${classId}/topics/${kcId}` }} />
              <OfflineDownloadButton url={`/api/classes/${classId}`} title={kc.title} />
            </div>
          </div>

          {canManage && prefs.language !== "en" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-xs">
              <span className="flex-1">
                {showOriginal
                  ? "Showing the original you edit and publish."
                  : `Showing this topic in ${languageInfo(prefs.language).name}, as your students see it. Editing works on the original.`}
              </span>
              <button type="button" onClick={() => setShowOriginal((v) => !v)} className="rounded-lg border border-brand-500/40 px-2.5 py-1 font-semibold hover:bg-brand-500/10">
                {showOriginal ? `View in ${languageInfo(prefs.language).name}` : "Show original"}
              </button>
            </div>
          )}
          {canManage && <StudyProfileCard classId={classId} kcId={kcId} profile={profile} onChange={(p: StudyProfile) => setKc((prev) => (prev ? { ...prev, studyProfile: p } : prev))} />}
          {canManage && <PublishBar classId={classId} kcId={kcId} refreshKey={`${shownTab}-${lessonBusy ? 1 : 0}`} />}

          {/* Tabs: scrollable on phones */}
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto -mx-1 px-1">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setActiveTab(t.key);
                  t.onOpen?.();
                }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all whitespace-nowrap",
                  shownTab === t.key
                    ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                )}
              >
                {t.step ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/10 dark:bg-white/15 text-[11px] font-bold">{t.step}</span> : t.icon} {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 -mt-2">
            <p className="text-xs text-slate-500 flex-1 min-w-0">
              {stepNow >= 0 && <b className="text-brand-700 dark:text-brand-300">Step {stepNow + 1} of {stepTabs.length}. </b>}
              {TAB_HINT[shownTab]}
            </p>
            {nextStep && (
              <Button size="sm" variant="outline" onClick={() => { setActiveTab(nextStep.key); nextStep.onOpen?.(); }}>
                Next: {nextStep.label} →
              </Button>
            )}
          </div>

          {/* LEARN */}
          {shownTab === "learn" && (
            <div className="space-y-4">
              {(canManage || pub.audio) && !lessonIsThin && <AudioLesson classId={classId} kcId={kcId} viewLang={viewLang} />}
              {!canManage && !pub.lesson ? notPublished("lecture note") : (
              <Card className="p-4 sm:p-6 md:p-8" translate="no">
                {lessonBusy && lessonIsThin ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
                      <Sparkles className="h-4 w-4 animate-pulse" /> Writing the full lesson for this topic…
                    </div>
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                ) : (
                  <InteractiveNote markdown={kc.lessonMarkdown || kc.description} topicTitle={kc.title} />
                )}
                {lessonError && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 text-xs">
                    <span className="flex-1">{lessonError}</span>
                    <Button size="sm" variant="outline" onClick={() => generateLesson()}>
                      <RotateCw className="h-3.5 w-3.5 mr-1" /> Try again
                    </Button>
                  </div>
                )}
              </Card>
              )}

              {canManage && (
                <Card className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Wand2 className="h-4 w-4 text-indigo-500" /> Teacher tools
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setShowLessonEditor((v) => !v)}>
                      Rewrite lesson with AI
                    </Button>
                  </div>
                  <LanguagePreview classId={classId} kcId={kcId} />
                  {showLessonEditor && (
                    <div className="space-y-2">
                      <Textarea
                        rows={3}
                        value={lessonInstructions}
                        onChange={(e) => setLessonInstructions(e.target.value)}
                        placeholder='Optional: "Simpler language for year 10", "Add two more worked examples", "Focus on AC circuits"…'
                        className="text-sm"
                      />
                      <Button size="sm" onClick={() => generateLesson({ regenerate: true })} isLoading={lessonBusy}>
                        <Sparkles className="h-4 w-4 mr-1.5" /> Rewrite
                      </Button>
                    </div>
                  )}
                  <PracticeBankTools classId={classId} kcId={kcId} />
                </Card>
              )}

              {kc.objectives && kc.objectives.length > 0 && (
                <Card className="p-5">
                  <h3 className="font-bold text-sm mb-2 text-slate-900 dark:text-slate-100">What you&apos;ll be able to do</h3>
                  <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                    {kc.objectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
                        <RichInline text={obj} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {profile.needs.simulation && <button
                  onClick={() => setActiveTab("simulate")}
                  className="text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-amber-500/60 transition-all"
                >
                  <Gamepad2 className="h-5 w-5 text-amber-500 mb-2" />
                  <p className="font-semibold text-sm">Play the simulation</p>
                  <p className="text-xs text-slate-500">Experiment and beat the challenge</p>
                </button>}
                {profile.needs.practice && <button
                  onClick={() => setActiveTab("quiz")}
                  className="text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-brand-500/60 transition-all"
                >
                  <HelpCircle className="h-5 w-5 text-brand-500 mb-2" />
                  <p className="font-semibold text-sm">Take a quiz</p>
                  <p className="text-xs text-slate-500">5–15 questions, instant feedback</p>
                </button>}
                <button
                  onClick={() => setActiveTab("tutor")}
                  className="text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/60 transition-all"
                >
                  <MessageSquare className="h-5 w-5 text-indigo-500 mb-2" />
                  <p className="font-semibold text-sm">Ask the tutor</p>
                  <p className="text-xs text-slate-500">Stuck? Get guided hints</p>
                </button>
              </div>

              <Card className="p-4 space-y-2">
                <p className="font-bold text-sm flex items-center gap-2"><PlayCircle className="h-4 w-4 text-rose-600" /> Videos on this topic</p>
                <StepVideos query={`${kc.title} explained`} />
              </Card>
            </div>
          )}

          {/* PIECES */}
          {shownTab === "pieces" && !canManage && !pub.simulation && notPublished("simulation")}
          {shownTab === "pieces" && (canManage || pub.simulation) && (
            <Card className="p-4 md:p-6">
              <PiecesLab classId={classId} kcId={kcId} topicTitle={kc.title} onEvidence={applyEvidenceUpdate} />
            </Card>
          )}

          {/* SIMULATE */}
          {shownTab === "simulate" && !canManage && !pub.simulation && notPublished("simulation")}
          {shownTab === "simulate" && (canManage || pub.simulation) && (
            <Card className="p-4 md:p-6 space-y-4">
              <AiSimulation classId={classId} kcId={kcId} topicTitle={kc.title} onEvidence={applyEvidenceUpdate} />

              {ClassicLab && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowClassicLab((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  >
                    <Cpu className="h-4 w-4 text-amber-500" />
                    {showClassicLab ? "Hide" : "Show"} the guided lab bench for this topic
                  </button>
                  {showClassicLab && (
                    <div className="mt-4">
                      <ClassicLab
                        config={kc.lab?.config as Record<string, string | number> | undefined}
                        onComplete={async (result) => {
                          try {
                            const res = await fetch("/api/labs/verify", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ classId, kcId, labType: kc.lab?.type, parameters: result.parameters || {} }),
                            });
                            const data = await res.json();
                            if (data.ok) {
                              applyEvidenceUpdate({ pLAfter: data.data.pLAfter, totalXp: data.data.totalXp, streakDays: data.data.streakDays });
                              toast({ title: data.data.credited === false ? "Lab completed (preview: no XP)" : "Lab completed! +30 XP", description: result.detail, variant: "success" });
                              if (data.data.crossedMasteryFirstTime) confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
                            } else {
                              toast({
                                title: data.error?.code === "LAB_RATE_LIMITED" ? "Slow down" : "Not quite",
                                description: data.error?.message || "Lab parameters did not meet the target.",
                                variant: "destructive",
                              });
                            }
                          } catch {
                            toast({ title: "Connection error", description: "Could not reach lab verification.", variant: "destructive" });
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* FLASHCARDS */}
          {/* self-study: flashcards and quizzes are open to every member; graded work goes through assignments */}
          {shownTab === "flashcards" && (
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                  <h3 className="font-bold text-base">Flashcards</h3>
                </div>
                <Button size="sm" variant="outline" onClick={handleLoadFlashcards} isLoading={loadingCards} className="text-xs">
                  <RotateCw className="h-3.5 w-3.5 mr-1" /> New deck
                </Button>
              </div>

              {loadingCards ? (
                <Skeleton className="h-56 w-full rounded-2xl" />
              ) : cardsError ? (
                <div className="text-center py-10 space-y-3">
                  <p className="text-sm text-rose-600 dark:text-rose-400">{cardsError}</p>
                  <Button size="sm" onClick={handleLoadFlashcards}>Try again</Button>
                </div>
              ) : flashcards.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <Button size="sm" onClick={handleLoadFlashcards}>Generate flashcards</Button>
                </div>
              ) : deckDone ? (
                <div className="text-center py-10 space-y-3">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                  <p className="font-bold">Deck complete!</p>
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setCurrentCardIndex(0); setDeckDone(false); setIsFlipped(false); }}>
                      Review again
                    </Button>
                    <Button size="sm" onClick={handleLoadFlashcards}>New deck</Button>
                  </div>
                </div>
              ) : (
                <div className="max-w-lg mx-auto space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Card {currentCardIndex + 1} of {flashcards.length}
                    </span>
                    <span>Tap the card to flip</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-brand-500 transition-all" style={{ width: `${((currentCardIndex + 1) / flashcards.length) * 100}%` }} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFlipped(!isFlipped)}
                    className={cn(
                      "w-full min-h-[220px] rounded-2xl border-2 p-6 flex flex-col justify-center items-center text-center shadow-md transition-all",
                      isFlipped
                        ? "border-brand-500 bg-brand-500/5"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500"
                    )}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-3">
                      {isFlipped ? "Answer" : "Question"}
                    </span>
                    <MarkdownRenderer localized
                      content={isFlipped ? flashcards[currentCardIndex].back : flashcards[currentCardIndex].front}
                      className="text-base font-semibold prose-p:my-1 text-center"
                    />
                  </button>

                  {isFlipped ? (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button
                        variant="outline"
                        className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:border-rose-900 text-xs"
                        onClick={() => handleFlashcardFeedback(false)}
                      >
                        <XCircle className="h-4 w-4 mr-1.5" /> Still learning
                      </Button>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => handleFlashcardFeedback(true)}>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> I knew it
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full text-xs" onClick={() => setIsFlipped(true)}>
                      Show answer
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* QUIZ */}
          {shownTab === "prove" && <ProveIt classId={classId} kcId={kcId} topicTitle={kc.title} />}
          {shownTab === "teach" && <TeachPanel source={{ type: "kc", classId, kcId }} canRegenerate={canManage} finish={profile.needs.practice ? { label: "Take the quiz to count toward your mastery →", onClick: () => setActiveTab("quiz") } : undefined} />}
          {shownTab === "build" && <TopicLabs classId={classId} kcId={kcId} topicTitle={kc.title} />}

          {shownTab === "quiz" && (
            <Card className="p-4 md:p-6">
              <QuizPlayer classId={classId} kcId={kcId} onEvidence={applyEvidenceUpdate} viewLang={viewLang} />
            </Card>
          )}

          {/* TUTOR */}
          {shownTab === "tutor" && (
            <Card className="flex flex-col h-[min(75vh,620px)]">
              <CardHeader className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs">AI</div>
                    <div>
                      <h3 className="font-bold text-sm">AI Tutor</h3>
                      <p className="text-[10px] text-slate-500">Focused on: {kc.title}</p>
                    </div>
                  </div>
                  {messages.length > 0 && (
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setMessages([])} disabled={isStreamingTutor}>
                      New chat
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-8 space-y-4">
                    <MessageSquare className="h-10 w-10 text-brand-500/40 mx-auto" />
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">
                      Ask anything about this topic. I&apos;ll guide you with hints rather than just handing over answers.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {TUTOR_STARTERS.map((s) => (
                        <button
                          key={s}
                          onClick={() => sendTutor(s)}
                          className="px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 text-xs hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-2xl p-3.5 text-sm leading-relaxed",
                        m.role === "user"
                          ? "bg-brand-600 text-white rounded-br-sm"
                          : m.isError
                          ? "bg-rose-500/10 text-rose-800 dark:text-rose-200 border border-rose-500/30 rounded-bl-sm"
                          : "bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100 rounded-bl-sm border border-slate-200 dark:border-slate-800"
                      )}
                    >
                      {m.role === "model" && !m.isError ? (
                        m.text ? (
                          <>
                            <MarkdownRenderer localized content={m.text} />
                            {!isStreamingTutor && <ReadAloud text={m.text} />}
                          </>
                        ) : (
                          <span className="inline-flex gap-1 py-1">
                            <span className="h-2 w-2 rounded-full bg-slate-400 typing-dot" />
                            <span className="h-2 w-2 rounded-full bg-slate-400 typing-dot [animation-delay:150ms]" />
                            <span className="h-2 w-2 rounded-full bg-slate-400 typing-dot [animation-delay:300ms]" />
                          </span>
                        )
                      ) : (
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </CardContent>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendTutor(inputMessage);
                }}
                className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0"
              >
                <Input
                  type="text"
                  placeholder="Ask a question about this topic…"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isStreamingTutor}
                  className="text-sm"
                />
                <Button type="submit" size="icon" disabled={!inputMessage.trim() || isStreamingTutor} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </Card>
          )}
        </div>

        {/* Mastery card */}
        <div className="lg:col-span-1 lg:sticky lg:top-20 space-y-4">
          <Card className="border-brand-500/30 shadow-lg">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider block">Your progress</span>
              <CardTitle className="text-base font-bold">Topic mastery</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-slate-500">Mastery</span>
                  <Badge className={`text-xs ${masteryStatus.colorClass}`}>
                    {masteryStatus.label} {attempts > 0 ? `(${formatPL(currentPL)})` : ""}
                  </Badge>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      attempts === 0
                        ? "bg-slate-300 dark:bg-slate-700"
                        : currentPL >= 0.95
                        ? "bg-emerald-500"
                        : currentPL >= 0.4
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    )}
                    style={{ width: `${attempts === 0 ? 0 : Math.min(100, currentPL * 100)}%` }}
                  />
                </div>
                {attempts === 0 && (
                  <p className="text-[11px] text-slate-500 mt-2">Take a quiz or play the simulation to start tracking.</p>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-brand-500" /> Total XP
                  </span>
                  <strong className="text-slate-900 dark:text-slate-100">{user?.xp ?? 0} XP</strong>
                </div>
                <div className="flex justify-between">
                  <span>Mastered at</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">95%</strong>
                </div>
              </div>

              {attempts > 0 && currentPL < 0.4 && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-200 text-xs space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-rose-500" /> Study with a peer?
                  </p>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    A classmate who has mastered this topic can help. Try the AI tutor or join a study lounge.
                  </p>
                  <Link href="/lounge" className="block pt-1">
                    <Button size="sm" variant="outline" className="w-full text-xs">Find a study partner</Button>
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
