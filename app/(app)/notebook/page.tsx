"use client";

import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { extractTextFromFile } from "@/lib/pdf/extractor";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  FileText,
  Upload,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Sparkles,
  Send,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Layers,
  HelpCircle,
  FileCode,
  X,
  Eye,
  CheckCircle2,
  Headphones,
  Info,
  RefreshCw,
} from "lucide-react";

interface SourceItem {
  id: string;
  title: string;
  content: string;
  type: "pdf" | "note";
  wordCount: number;
  active: boolean;
  createdAt: string;
}

interface Citation {
  tag: string;
  sourceId: string;
  sourceTitle: string;
  excerpt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  citations?: Citation[];
}

interface DialogueTurn {
  speaker: "Alex" | "Sam";
  text: string;
}

interface DeepDiveEpisode {
  title: string;
  overview: string;
  dialogue: DialogueTurn[];
}

interface Flashcard {
  front: string;
  back: string;
}

interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export default function NotebookPage() {
  const { toast } = useToast();

  // Mobile Segmented Tab State
  const [mobileTab, setMobileTab] = useState<"chat" | "sources" | "studio">("chat");

  // Sources State
  const [sources, setSources] = useState<SourceItem[]>([]);

  const [activeAddModal, setActiveAddModal] = useState(false);
  const [modalTab, setModalTab] = useState<"paste" | "upload">("paste");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewSource, setPreviewSource] = useState<SourceItem | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      role: "model",
      text: "Welcome to your **Source-Grounded Notebook**! All answers are generated strictly using your active source materials with verifiable inline citations `[S1]`, `[S2]`. Ask anything or generate study artifacts in the studio panel.",
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeCitationPopover, setActiveCitationPopover] = useState<Citation | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Studio / Artifacts State
  const [studioTab, setStudioTab] = useState<"deepdive" | "summary" | "flashcards" | "quiz">("deepdive");
  const [deepDiveEpisode, setDeepDiveEpisode] = useState<DeepDiveEpisode | null>(null);
  const [generatingPodcast, setGeneratingPodcast] = useState(false);

  // Audio Playback State (Google Voice Lab & Fallback)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [studioVoiceEnabled, setStudioVoiceEnabled] = useState(true);
  const [loadingTurnAudio, setLoadingTurnAudio] = useState(false);
  const [turnAudioCache, setTurnAudioCache] = useState<Record<number, string>>({});
  const isSpeakingRef = useRef(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Study Guide, Flashcards, Quiz Artifacts State
  const [studyGuideMarkdown, setStudyGuideMarkdown] = useState<string | null>(null);
  const [generatingStudyGuide, setGeneratingStudyGuide] = useState(false);

  const [flashcardDeck, setFlashcardDeck] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);

  const [quizQuestions, setQuizQuestions] = useState<QuizItem[]>([]);
  const [selectedQuizAnswers, setSelectedQuizAnswers] = useState<Record<number, number>>({});
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  // Active Sources Helper
  const activeSources = sources.filter((s) => s.active);
  const totalWords = activeSources.reduce((acc, s) => acc + s.wordCount, 0);

  // Source Operations
  const toggleSourceActive = (id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    toast({ title: "Source Removed", description: "Source excluded from notebook." });
  };

  const handleAddPastedSource = () => {
    if (!pasteTitle.trim() || !pasteContent.trim()) {
      toast({ title: "Incomplete", description: "Provide both a title and text.", variant: "destructive" });
      return;
    }

    const newSource: SourceItem = {
      id: `source-${sources.length + 1}`,
      title: pasteTitle.trim(),
      content: pasteContent.trim(),
      type: "note",
      wordCount: pasteContent.trim().split(/\s+/).length,
      active: true,
      createdAt: new Date().toLocaleDateString(),
    };

    setSources((prev) => [newSource, ...prev]);
    setPasteTitle("");
    setPasteContent("");
    setActiveAddModal(false);
    toast({ title: "Source Added", description: `Indexed ${newSource.wordCount} words.`, variant: "success" });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const extractedText = await extractTextFromFile(file);
      if (!extractedText.trim()) {
        throw new Error("Unable to extract text content from file.");
      }

      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      const newSource: SourceItem = {
        id: `source-${sources.length + 1}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        content: extractedText,
        type: isPdf ? "pdf" : "note",
        wordCount: extractedText.split(/\s+/).length,
        active: true,
        createdAt: new Date().toLocaleDateString(),
      };

      setSources((prev) => [newSource, ...prev]);
      setActiveAddModal(false);
      toast({
        title: "File Processed",
        description: `Successfully extracted ${newSource.wordCount} words from ${file.name}.`,
        variant: "success",
      });
    } catch (err: unknown) {
      toast({
        title: "Extraction Error",
        description: err instanceof Error ? err.message : "Failed to process document.",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  // Chat Execution
  const handleSendChat = async (e?: React.FormEvent, directPrompt?: string) => {
    if (e) e.preventDefault();
    const query = directPrompt || inputQuery.trim();
    if (!query || isChatLoading) return;

    if (activeSources.length === 0) {
      toast({
        title: "No Active Sources",
        description: "Check at least one source document in the left pane to ground responses.",
        variant: "amber",
      });
      return;
    }

    setInputQuery("");
    const userMsg: ChatMessage = { id: `user-msg-${messages.length + 1}`, role: "user", text: query };
    setMessages((prev) => [...prev, userMsg]);
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/notebook/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sources: activeSources.map((s) => ({ id: s.id, title: s.title, content: s.content })),
          history: messages.slice(-4).map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const json = await res.json();
      if (json.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `model-msg-${prev.length + 1}`,
            role: "model",
            text: json.data.answer,
            citations: json.data.citations,
          },
        ]);
      } else {
        toast({
          title: "Synthesizer Notice",
          description: json.error?.message || "Failed to generate grounded response.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Connection Error", description: "Failed to connect to notebook AI.", variant: "destructive" });
    } finally {
      setIsChatLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  // Deep Dive Podcast Generation
  const handleGeneratePodcast = async () => {
    if (activeSources.length === 0) {
      toast({ title: "No Sources", description: "Select active sources first.", variant: "amber" });
      return;
    }

    setGeneratingPodcast(true);
    stopAudio();

    try {
      const res = await fetch("/api/notebook/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: activeSources.map((s) => ({ id: s.id, title: s.title, content: s.content })),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDeepDiveEpisode(json.data);
        setCurrentTurnIndex(0);
        setTurnAudioCache({});
        toast({ title: "Script Ready", description: "Converting the full two-host script to audio...", variant: "success" });

        try {
          const audioRes = await fetch("/api/notebook/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dialogue: (json.data.dialogue || []).map((t: { speaker: string; text: string }) => ({
                speaker: t.speaker,
                text: t.text,
              })),
            }),
          });
          const audioJson = await audioRes.json();
          if (audioJson.ok && Array.isArray(audioJson.data?.turns)) {
            const cache: Record<number, string> = {};
            for (const t of audioJson.data.turns) {
              cache[t.index] = `data:${t.mimeType || "audio/mpeg"};base64,${t.audioBase64}`;
            }
            setTurnAudioCache(cache);
            toast({ title: "Podcast Ready", description: "Full 2-host audio generated. Press play.", variant: "success" });
          }
        } catch (audioErr) {
          console.warn("Full-episode audio synthesis failed; will synthesize per turn:", audioErr);
        }
      } else {
        toast({ title: "Error", description: json.error?.message || "Failed to generate podcast.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate Deep Dive.", variant: "destructive" });
    } finally {
      setGeneratingPodcast(false);
    }
  };

  // SpeechSynthesis Fallback Audio
  const playWithBrowserTts = (turn: { speaker: string; text: string }, index: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast({ title: "Audio Unsupported", description: "Browser does not support audio synthesis.", variant: "destructive" });
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(turn.text);
    utterance.rate = playbackSpeed;
    if (turn.speaker === "Alex") {
      utterance.pitch = 1.08;
    } else {
      utterance.pitch = 0.90;
    }

    utterance.onend = () => {
      if (isSpeakingRef.current) {
        playTurn(index + 1);
      }
    };

    utterance.onerror = () => {
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
    };

    window.speechSynthesis.speak(utterance);
  };

  // 2-Host Deep Dive Audio Engine (Google Voice Lab Primary)
  const playTurn = async (index: number) => {
    if (!deepDiveEpisode || index >= deepDiveEpisode.dialogue.length) {
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
      return;
    }

    // Stop current audio elements
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setCurrentTurnIndex(index);
    isSpeakingRef.current = true;
    setIsPlayingAudio(true);

    const turn = deepDiveEpisode.dialogue[index];

    // Priority 1: High-fidelity Google Voice Lab
    if (studioVoiceEnabled) {
      let audioUrl = turnAudioCache[index];
      if (!audioUrl) {
        setLoadingTurnAudio(true);
        try {
          const res = await fetch("/api/notebook/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: turn.text,
              speaker: turn.speaker,
            }),
          });
          const json = await res.json();
          if (json.ok && json.data?.audioBase64) {
            audioUrl = `data:${json.data.mimeType || "audio/wav"};base64,${json.data.audioBase64}`;
            setTurnAudioCache((prev) => ({ ...prev, [index]: audioUrl }));
          }
        } catch (err) {
          console.warn("Studio voice synthesis failed, falling back to browser:", err);
        } finally {
          setLoadingTurnAudio(false);
        }
      }

      if (audioUrl && isSpeakingRef.current) {
        const audio = new Audio(audioUrl);
        audio.playbackRate = playbackSpeed;
        audioElementRef.current = audio;
        audio.onended = () => {
          if (isSpeakingRef.current) {
            playTurn(index + 1);
          }
        };
        audio.onerror = () => {
          playWithBrowserTts(turn, index);
        };
        audio.play().catch(() => {
          playWithBrowserTts(turn, index);
        });
        return;
      }
    }

    // Priority 2: Browser SpeechSynthesis Fallback
    playWithBrowserTts(turn, index);
  };

  const togglePlayAudio = () => {
    if (isPlayingAudio) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.pause();
      }
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
    } else {
      if (audioElementRef.current && audioElementRef.current.paused && audioElementRef.current.currentTime > 0) {
        audioElementRef.current.play();
        setIsPlayingAudio(true);
        isSpeakingRef.current = true;
      } else if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPlayingAudio(true);
        isSpeakingRef.current = true;
      } else {
        playTurn(currentTurnIndex);
      }
    }
  };

  const stopAudio = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    isSpeakingRef.current = false;
    setCurrentTurnIndex(0);
  };

  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Studio Artifacts Generation
  const handleGenerateStudyGuide = async () => {
    if (activeSources.length === 0) return;
    setGeneratingStudyGuide(true);
    try {
      const res = await fetch("/api/notebook/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "summary",
          sources: activeSources.map((s) => ({ id: s.id, title: s.title, content: s.content })),
        }),
      });
      const json = await res.json();
      if (json.ok) setStudyGuideMarkdown(json.data.markdown);
    } finally {
      setGeneratingStudyGuide(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (activeSources.length === 0) return;
    setGeneratingCards(true);
    try {
      const res = await fetch("/api/notebook/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "flashcards",
          sources: activeSources.map((s) => ({ id: s.id, title: s.title, content: s.content })),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setFlashcardDeck(json.data.cards);
        setCurrentCardIndex(0);
        setIsCardFlipped(false);
      }
    } finally {
      setGeneratingCards(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (activeSources.length === 0) return;
    setGeneratingQuiz(true);
    try {
      const res = await fetch("/api/notebook/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "quiz",
          sources: activeSources.map((s) => ({ id: s.id, title: s.title, content: s.content })),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setQuizQuestions(json.data.questions);
        setSelectedQuizAnswers({});
      }
    } finally {
      setGeneratingQuiz(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Source-Grounded Studio</Badge>
            <Badge variant="emerald" className="text-xs">NotebookLM Architecture</Badge>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
            Research Notebook & Deep Dive Studio
          </h1>
          <p className="text-xs text-slate-500">
            Ingest PDFs, notes, and research materials &bull; Grounded Q&A with verifiable citations &bull; 2-Host Audio Discussions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setActiveAddModal(true)} className="text-xs">
            <Plus className="h-4 w-4 mr-1" /> Add Source Document
          </Button>
        </div>
      </div>

      {/* MOBILE SEGMENTED TAB BAR (Below lg) */}
      <div className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-md pb-2 pt-1 border-b border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-3 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={cn(
              "py-2 rounded-lg transition-all text-center min-h-[44px] flex items-center justify-center gap-1.5",
              mobileTab === "chat"
                ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("sources")}
            className={cn(
              "py-2 rounded-lg transition-all text-center min-h-[44px] flex items-center justify-center gap-1.5",
              mobileTab === "sources"
                ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Sources ({sources.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("studio")}
            className={cn(
              "py-2 rounded-lg transition-all text-center min-h-[44px] flex items-center justify-center gap-1.5",
              mobileTab === "studio"
                ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Studio</span>
          </button>
        </div>
      </div>

      {/* 3-PANE NOTEBOOK WORKSPACE LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT PANE: SOURCES LIBRARY (3 Cols) */}
        <div className={cn("lg:col-span-3 space-y-3", mobileTab !== "sources" && "hidden lg:block")}>
          <Card className="p-4 border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                <BookOpen className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span>Sources Library ({sources.length})</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {totalWords.toLocaleString()} Words Active
              </Badge>
            </div>

            {sources.length === 0 ? (
              <div className="text-center py-8 space-y-2 border border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                <FileText className="h-6 w-6 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No sources indexed</p>
                <Button size="sm" variant="outline" onClick={() => setActiveAddModal(true)} className="text-[11px]">
                  Add PDF or Notes
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className={`p-3 rounded-xl border transition-all ${
                      src.active
                        ? "border-teal-500/40 bg-teal-50/40 dark:bg-teal-950/20"
                        : "border-slate-200 dark:border-slate-800 opacity-60 bg-slate-50/50 dark:bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => toggleSourceActive(src.id)}
                        className="flex items-start gap-2 text-left min-w-0"
                      >
                        {src.active ? (
                          <CheckSquare className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {src.title}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span className="uppercase font-mono">{src.type}</span>
                            <span>&bull;</span>
                            <span>{src.wordCount} words</span>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setPreviewSource(src)}
                          title="Preview Text"
                          className="h-6 w-6 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeSource(src.id)}
                          title="Delete Source"
                          className="h-6 w-6 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 flex items-center justify-center text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* CENTER PANE: GROUNDED CHAT & CITATIONS (5 Cols) */}
        <div className={cn("lg:col-span-5 space-y-3", mobileTab !== "chat" && "hidden lg:block")}>
          <Card className="flex flex-col h-[calc(100dvh-13rem)] lg:h-[680px] border-slate-200 dark:border-slate-800">
            {/* Grounding Header */}
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Grounded Synthesis Engine
                </span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {activeSources.length} Source{activeSources.length === 1 ? "" : "s"} Grounded
              </Badge>
            </div>

            {/* Message History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl p-4 text-xs ${
                      m.role === "user"
                        ? "bg-teal-600 text-white shadow-sm"
                        : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    <MarkdownRenderer content={m.text} />

                    {/* Citations Tag Row */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-slate-400 font-semibold mr-1">
                          Citations:
                        </span>
                        {m.citations.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveCitationPopover(c)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-[10px] font-mono font-bold transition-all"
                            title={`Inspect ${c.tag} excerpt`}
                          >
                            <span>{c.tag}</span>
                            <span className="truncate max-w-[80px] font-normal opacity-80">
                              {c.sourceTitle}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                  <Sparkles className="h-4 w-4 animate-spin text-teal-500" />
                  <span>Synthesizing source-grounded response with citations...</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Suggested Prompts Pill Row (when only welcome message) */}
            {messages.length === 1 && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                {[
                  "What is the mathematical definition of cutoff frequency?",
                  "Explain Joule heating and power dissipation",
                  "How does a digital half-adder calculate sum and carry?",
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendChat(undefined, prompt)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-teal-500 hover:text-teal-600 transition-all text-left"
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            )}

            {/* Input Bar */}
            <form onSubmit={handleSendChat} className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <Input
                placeholder="Ask anything grounded in your source materials..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={isChatLoading || activeSources.length === 0}
                className="h-11 text-base md:text-xs"
              />
              <Button
                type="submit"
                disabled={!inputQuery.trim() || isChatLoading || activeSources.length === 0}
                size="sm"
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT PANE: STUDIO & ARTIFACTS (4 Cols) */}
        <div className={cn("lg:col-span-4 space-y-3", mobileTab !== "studio" && "hidden lg:block")}>
          <Card className="min-h-[500px] lg:h-[680px] flex flex-col border-slate-200 dark:border-slate-800">
            {/* Studio Navigation Tabs */}
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1 overflow-x-auto bg-slate-50/50 dark:bg-slate-900/50">
              <button
                onClick={() => setStudioTab("deepdive")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  studioTab === "deepdive"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <Headphones className="h-3.5 w-3.5" /> Deep Dive
              </button>

              <button
                onClick={() => setStudioTab("summary")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  studioTab === "summary"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <FileCode className="h-3.5 w-3.5" /> Guide
              </button>

              <button
                onClick={() => setStudioTab("flashcards")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  studioTab === "flashcards"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <Layers className="h-3.5 w-3.5" /> Cards
              </button>

              <button
                onClick={() => setStudioTab("quiz")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  studioTab === "quiz"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" /> Quiz
              </button>
            </div>

            {/* TAB CONTENT CONTAINER */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* TAB 1: 2-HOST DEEP DIVE PODCAST */}
              {studioTab === "deepdive" && (
                <div className="space-y-4">
                  {!deepDiveEpisode ? (
                    <div className="text-center py-12 space-y-3 border border-dashed rounded-2xl border-slate-200 dark:border-slate-800 p-6">
                      <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                        <Headphones className="h-6 w-6" />
                      </div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        2-Host Audio Deep Dive
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Transform your source documents into an engaging back-and-forth conversation between <strong>Alex</strong> and <strong>Sam</strong> with live browser speech playback!
                      </p>
                      <Button
                        size="sm"
                        onClick={handleGeneratePodcast}
                        isLoading={generatingPodcast}
                        disabled={activeSources.length === 0}
                        className="text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate Deep Dive Audio
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Audio Player Widget */}
                      <div className="p-4 rounded-2xl border border-teal-500/30 bg-teal-50/40 dark:bg-teal-950/20 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">
                              Now Playing Deep Dive
                            </span>
                            <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                              {deepDiveEpisode.title}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setStudioVoiceEnabled((v) => !v)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors flex items-center gap-1 ${
                                studioVoiceEnabled
                                  ? "bg-teal-600 text-white shadow-sm"
                                  : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              {studioVoiceEnabled ? "Studio Neural Voice" : "Browser TTS"}
                            </button>
                            <Badge variant="emerald" className="text-[10px]">
                              {deepDiveEpisode.dialogue.length} Turns
                            </Badge>
                          </div>
                        </div>

                        {/* Player Controls Bar */}
                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-teal-500/20">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={togglePlayAudio}
                              className="h-8 px-3 text-xs"
                            >
                              {isPlayingAudio ? (
                                <>
                                  <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                                </>
                              ) : (
                                <>
                                  <Play className="h-3.5 w-3.5 mr-1" /> Play Audio
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={stopAudio}
                              className="h-8 px-2 text-xs"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            {loadingTurnAudio && (
                              <span className="text-[10px] text-teal-600 dark:text-teal-400 flex items-center gap-1 font-mono">
                                <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Synthesizing...
                              </span>
                            )}
                          </div>

                          {/* Speed Toggle */}
                          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500">
                            {[1.0, 1.25, 1.5].map((speed) => (
                              <button
                                key={speed}
                                onClick={() => setPlaybackSpeed(speed)}
                                className={`px-1.5 py-0.5 rounded ${
                                  playbackSpeed === speed
                                    ? "bg-teal-600 text-white font-bold"
                                    : "hover:bg-slate-200 dark:hover:bg-slate-800"
                                }`}
                              >
                                {speed}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Live Dialogue Transcript */}
                      <div className="space-y-2.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Conversation Transcript
                        </span>
                        {deepDiveEpisode.dialogue.map((turn, i) => {
                          const isCurrent = currentTurnIndex === i && isPlayingAudio;
                          return (
                            <div
                              key={i}
                              onClick={() => playTurn(i)}
                              className={`p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                                isCurrent
                                  ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40 shadow-sm"
                                  : "border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-900"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span
                                  className={`font-bold text-[11px] ${
                                    turn.speaker === "Alex"
                                      ? "text-teal-600 dark:text-teal-400"
                                      : "text-amber-600 dark:text-amber-400"
                                  }`}
                                >
                                  {turn.speaker} {turn.speaker === "Alex" ? "(Host 1)" : "(Host 2)"}
                                </span>
                                {isCurrent && (
                                  <span className="flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                                    <Volume2 className="h-3 w-3 animate-pulse" /> Speaking
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                {turn.text}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: STUDY GUIDE */}
              {studioTab === "summary" && (
                <div className="space-y-4">
                  {!studyGuideMarkdown ? (
                    <div className="text-center py-12 space-y-3">
                      <FileCode className="h-8 w-8 text-slate-400 mx-auto" />
                      <h4 className="font-bold text-sm">Synthesize Comprehensive Study Guide</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Extract key theorems, definitions, and mathematical formulations from your active sources.
                      </p>
                      <Button
                        size="sm"
                        onClick={handleGenerateStudyGuide}
                        isLoading={generatingStudyGuide}
                        className="text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Study Guide
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold">Source Study Guide</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateStudyGuide}
                          isLoading={generatingStudyGuide}
                          className="text-[10px] h-7"
                        >
                          Regenerate
                        </Button>
                      </div>
                      <div className="text-xs leading-relaxed">
                        <MarkdownRenderer content={studyGuideMarkdown} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: FLASHCARDS */}
              {studioTab === "flashcards" && (
                <div className="space-y-4">
                  {flashcardDeck.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                      <Layers className="h-8 w-8 text-slate-400 mx-auto" />
                      <h4 className="font-bold text-sm">Grounded Active Recall Cards</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Test conceptual understanding with flashcards extracted directly from your sources.
                      </p>
                      <Button
                        size="sm"
                        onClick={handleGenerateFlashcards}
                        isLoading={generatingCards}
                        className="text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Flashcards
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span>
                          Card {currentCardIndex + 1} of {flashcardDeck.length}
                        </span>
                        <span>Click card to flip</span>
                      </div>

                      <div
                        onClick={() => setIsCardFlipped(!isCardFlipped)}
                        className="cursor-pointer min-h-[180px] rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-center items-center text-center shadow-sm hover:border-teal-500 transition-all select-none"
                      >
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">
                          {isCardFlipped ? "Answer" : "Question"}
                        </span>
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                          {isCardFlipped
                            ? flashcardDeck[currentCardIndex].back
                            : flashcardDeck[currentCardIndex].front}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentCardIndex === 0}
                          onClick={() => {
                            setCurrentCardIndex((i) => i - 1);
                            setIsCardFlipped(false);
                          }}
                          className="text-xs"
                        >
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          disabled={currentCardIndex === flashcardDeck.length - 1}
                          onClick={() => {
                            setCurrentCardIndex((i) => i + 1);
                            setIsCardFlipped(false);
                          }}
                          className="text-xs"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: PRACTICE QUIZ */}
              {studioTab === "quiz" && (
                <div className="space-y-4">
                  {quizQuestions.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                      <HelpCircle className="h-8 w-8 text-slate-400 mx-auto" />
                      <h4 className="font-bold text-sm">Grounded Knowledge Quiz</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Challenge yourself with a 4-question conceptual quiz grounded in your source materials.
                      </p>
                      <Button
                        size="sm"
                        onClick={handleGenerateQuiz}
                        isLoading={generatingQuiz}
                        className="text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Quiz
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {quizQuestions.map((q, qIndex) => {
                        const selected = selectedQuizAnswers[qIndex];
                        const isAnswered = selected !== undefined;
                        const isCorrect = selected === q.correctIndex;

                        return (
                          <div
                            key={qIndex}
                            className={`p-3.5 rounded-xl border text-xs space-y-2.5 transition-all ${
                              isAnswered
                                ? isCorrect
                                  ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20"
                                  : "border-rose-500/40 bg-rose-50/40 dark:bg-rose-950/20"
                                : "border-slate-200 dark:border-slate-800"
                            }`}
                          >
                            <p className="font-bold text-slate-900 dark:text-slate-100">
                              {qIndex + 1}. {q.question}
                            </p>

                            <div className="space-y-1.5">
                              {q.options.map((opt, optIndex) => (
                                <button
                                  key={optIndex}
                                  onClick={() =>
                                    setSelectedQuizAnswers((prev) => ({ ...prev, [qIndex]: optIndex }))
                                  }
                                  className={`w-full text-left p-2 rounded-lg border text-[11px] transition-all flex items-center justify-between ${
                                    selected === optIndex
                                      ? optIndex === q.correctIndex
                                        ? "border-emerald-500 bg-emerald-100/60 dark:bg-emerald-900/40 font-bold"
                                        : "border-rose-500 bg-rose-100/60 dark:bg-rose-900/40 font-bold"
                                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                  }`}
                                >
                                  <span>{opt}</span>
                                  {isAnswered && optIndex === q.correctIndex && (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  )}
                                </button>
                              ))}
                            </div>

                            {isAnswered && (
                              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                                <strong>Explanation:</strong> {q.explanation}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ADD SOURCE MODAL */}
      {activeAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Add Source Document
                </h3>
              </div>
              <button
                onClick={() => setActiveAddModal(false)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <button
                onClick={() => setModalTab("paste")}
                className={`py-1.5 text-xs font-bold rounded-lg ${
                  modalTab === "paste" ? "bg-teal-600 text-white" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                Paste Text / Notes
              </button>
              <button
                onClick={() => setModalTab("upload")}
                className={`py-1.5 text-xs font-bold rounded-lg ${
                  modalTab === "upload" ? "bg-teal-600 text-white" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                Upload File (.pdf, .txt)
              </button>
            </div>

            {modalTab === "paste" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Document Title
                  </label>
                  <Input
                    placeholder="e.g. Chapter 4: Resonance and Impedance"
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    className="text-xs"
                  >
                  </Input>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Source Text
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Paste full notes, papers, or course text..."
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveAddModal(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddPastedSource}>
                    Index & Add Source
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-4 text-center">
                <div className="border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800 p-8 space-y-3">
                  <Upload className="h-8 w-8 text-teal-600 dark:text-teal-400 mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Upload PDF or Text File
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Supports .pdf, .txt, .md formats
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                  />
                </div>
                {uploadingFile && (
                  <p className="text-xs text-teal-600 font-semibold animate-pulse">
                    Extracting document text via PDF.js engine...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CITATION INSPECT POPOVER MODAL */}
      {activeCitationPopover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs text-teal-700 dark:text-teal-300">
                <Info className="h-4 w-4" />
                <span>Citation Verification: {activeCitationPopover.tag}</span>
              </div>
              <button
                onClick={() => setActiveCitationPopover(null)}
                className="h-6 w-6 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Source Document
              </span>
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {activeCitationPopover.sourceTitle}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Verifiable Excerpt
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-teal-500/5 p-3 rounded-xl border border-teal-500/20 leading-relaxed font-mono">
                &ldquo;{activeCitationPopover.excerpt}&rdquo;
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setActiveCitationPopover(null)} className="text-xs">
                Close Verification
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW SOURCE MODAL */}
      {previewSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {previewSource.title}
                </h3>
                <span className="text-xs text-slate-400">
                  {previewSource.wordCount} words &bull; Added {previewSource.createdAt}
                </span>
              </div>
              <button
                onClick={() => setPreviewSource(null)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">
              {previewSource.content}
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => setPreviewSource(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
