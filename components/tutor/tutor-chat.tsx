"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Volume2, Square, Trash2, Loader2, GraduationCap, Calculator, LifeBuoy } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { createSpeaker, type Speaker } from "@/lib/audio/speak";
import { ExplainLevelToggle, useExplainLevel } from "@/components/study/explain-level-toggle";
import {
  dispatchCalculatorEvent,
  extractTutorCalculatorDirective,
  parseCalculatorRequest,
} from "@/lib/pet/calc-intent";

interface Msg {
  id: string;
  role: "user" | "model";
  text: string;
  isError?: boolean;
  calcExpr?: string | null;
  calcSuggest?: boolean;
}

interface ClassLite {
  id: string;
  title: string;
}

interface TopicLite {
  id: string;
  title: string;
}

const SUGGESTIONS = [
  "Explain this like I'm new to it",
  "Make me a 5-question practice quiz",
  "Help me plan a study session for tonight",
  "What are the most common mistakes on this?",
];

export const STUCK_OPTIONS = [
  { id: "simpler", label: "Explain it simpler", prompt: "I'm stuck. Please explain this concept in much simpler terms, step by step, without jargon." },
  { id: "example", label: "Give me a real-life example", prompt: "I'm stuck. Give me a concrete real-life example or analogy that makes this intuition click." },
  { id: "visual", label: "Show me visually", prompt: "I'm stuck. Show me this visually using an ASCII diagram, mental model, or step-by-step trace." },
  { id: "steps", label: "Break it into smaller steps", prompt: "I'm stuck. Break this down into small, bite-sized steps and walk me through step 1 first." },
  { id: "hint", label: "Give me a hint, not the answer", prompt: "I'm stuck. Give me a Socratic hint that points me in the right direction without giving away the answer." },
  { id: "similar", label: "Let me try a similar question", prompt: "Give me a similar practice question at a slightly easier level so I can test my understanding." },
  { id: "wrong", label: "Explain why I got this wrong", prompt: "Help me diagnose my misconception: explain the most likely reason a student gets this wrong and how to fix it." },
];

function storageKey(classId: string, kcId: string) {
  return `tutor:${classId || "general"}:${kcId || "all"}`;
}

function loadSaved(key: string): Msg[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function save(key: string, msgs: Msg[]) {
  try {
    localStorage.setItem(key, JSON.stringify(msgs.filter((m) => !m.isError && m.text).slice(-40)));
  } catch {
    // storage unavailable (private mode); the chat still works for this visit
  }
}

async function fetchMyClasses(): Promise<ClassLite[]> {
  try {
    const j = await fetch("/api/classes?scope=mine").then((r) => r.json());
    if (!j.ok) return [];
    return asArray<{ id: string; title: string; isOwner?: boolean; userEnrollmentStatus?: string }>(j.data)
      .filter((c) => c.isOwner || c.userEnrollmentStatus === "active")
      .map((c) => ({ id: c.id, title: c.title }));
  } catch {
    return [];
  }
}

async function fetchTopics(classId: string): Promise<TopicLite[]> {
  try {
    const j = await fetch(`/api/classes/${classId}`).then((r) => r.json());
    return j.ok ? asArray<{ id: string; title: string }>(j.data.kcs).map((k) => ({ id: k.id, title: k.title })) : [];
  } catch {
    return [];
  }
}

/**
 * General-purpose AI tutor: ask about anything, or focus it on one of your classes or a topic.
 * Conversations are kept per context in this browser.
 */
export function TutorChat({
  initialClassId = "",
  initialKcId = "",
  initialPrompt = "",
  compact = false,
}: {
  initialClassId?: string;
  initialKcId?: string;
  initialPrompt?: string;
  compact?: boolean;
}) {
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [topics, setTopics] = useState<TopicLite[]>([]);
  const [classId, setClassId] = useState(initialClassId);
  const [kcId, setKcId] = useState(initialKcId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stuckOpen, setStuckOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [level, setLevel] = useExplainLevel();
  const bottomRef = useRef<HTMLDivElement>(null);
  const speaker = useRef<Speaker | null>(null);
  const key = storageKey(classId, kcId);

  useEffect(() => {
    fetchMyClasses().then(setClasses);
  }, []);

  useEffect(() => {
    if (!classId) {
      const t = setTimeout(() => setTopics([]), 0);
      return () => clearTimeout(t);
    }
    fetchTopics(classId).then(setTopics);
  }, [classId]);

  // Restore this context's conversation
  useEffect(() => {
    const t = setTimeout(() => setMessages(loadSaved(key)), 0);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => speaker.current?.stop(), []);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");

    const calcReq = parseCalculatorRequest(text);
    if (calcReq.shouldOpen) {
      dispatchCalculatorEvent({
        open: true,
        expr: calcReq.expr ?? undefined,
        label: contextLabel ? `Calculator · ${contextLabel}` : "Requested for Sprout",
        source: "tutor-request",
      });
      if (calcReq.calculatorOnly) {
        const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
        const botMsg: Msg = {
          id: crypto.randomUUID(),
          role: "model",
          text: "I opened the **Sprout Overlay Calculator** for you! You can type equations, plot `f(x)`, or tap **Ask Sprout to explain this step** anytime.",
          calcSuggest: true,
          calcExpr: calcReq.expr,
        };
        setMessages((prev) => {
          const next = [...prev, userMsg, botMsg];
          save(key, next);
          return next;
        });
        return;
      }
    }

    const history = messages.filter((m) => !m.isError && m.text).slice(-12).map((m) => ({ role: m.role, parts: m.text }));
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
    const replyId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: replyId, role: "model", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: classId || null, kcId: kcId || null, message: text, level, history }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "The tutor is unavailable right now. Please try again.");
      }
      const rawReply = await res.text();
      const directive = extractTutorCalculatorDirective(rawReply, text);
      if (directive.autoOpen && !calcReq.shouldOpen) {
        dispatchCalculatorEvent({
          open: true,
          expr: directive.expr ?? undefined,
          label: contextLabel ? `Sprout Tool · ${contextLabel}` : "Sprout Calculator Tool",
          auto: true,
          source: "tutor-auto",
        });
      }
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === replyId
            ? {
                ...m,
                text: directive.cleanText,
                calcSuggest: directive.shouldSuggest,
                calcExpr: directive.expr,
              }
            : m
        );
        save(key, next);
        return next;
      });
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => (m.id === replyId ? { ...m, isError: true, text: e instanceof Error ? e.message : "The tutor is unavailable right now." } : m))
      );
    } finally {
      setBusy(false);
    }
  };

  const sentInitial = useRef(false);
  useEffect(() => {
    if (initialPrompt && !sentInitial.current && !busy) {
      sentInitial.current = true;
      const t = setTimeout(() => {
        void send(initialPrompt);
      }, 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, busy]);

  const speak = (m: Msg) => {
    speaker.current ||= createSpeaker();
    speaker.current.stop();
    if (speakingId === m.id) {
      setSpeakingId(null);
      return;
    }
    setSpeakingId(m.id);
    speaker.current.say(
      m.text,
      () => setSpeakingId(null),
      () => setSpeakingId(null)
    );
  };

  const clear = () => {
    setMessages([]);
    save(key, []);
  };

  const contextLabel = kcId ? topics.find((t) => t.id === kcId)?.title : classId ? classes.find((c) => c.id === classId)?.title : null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <GraduationCap className="h-4 w-4 text-brand-600 shrink-0" />
        <select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setKcId("");
          }}
          aria-label="Focus the tutor on a class"
          className="h-8 min-w-0 max-w-[45%] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs"
        >
          <option value="">Any subject</option>
          {asArray(classes).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        {classId && (
          <select
            value={kcId}
            onChange={(e) => setKcId(e.target.value)}
            aria-label="Focus the tutor on a topic"
            className="h-8 min-w-0 max-w-[45%] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs"
          >
            <option value="">Whole class</option>
            {asArray(topics).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
        <ExplainLevelToggle value={level} onChange={setLevel} className="ml-auto" />
        {messages.length > 0 && (
          <button type="button" onClick={clear} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600" aria-label="Clear conversation" title="Clear conversation">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={cn("flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3", compact ? "text-sm" : "text-sm md:text-[15px]")}>
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-brand-600" />
            </div>
            <div>
              <p className="font-bold">Ask your AI tutor anything</p>
              <p className="text-xs text-slate-500 mt-1">
                {contextLabel ? `Focused on ${contextLabel}.` : "Any subject — or pick a class or topic above for answers grounded in your lessons."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5",
                m.role === "user"
                  ? "bg-brand-600 text-white"
                  : m.isError
                    ? "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                    : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              )}
            >
              {m.role === "model" && !m.text && !m.isError ? (
                <span className="flex items-center gap-2 text-slate-500 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                </span>
              ) : m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.text}</p>
              ) : (
                <MarkdownRenderer localized content={m.text} />
              )}
            </div>
            {m.role === "model" && m.text && !m.isError && (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => speak(m)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-brand-600">
                  {speakingId === m.id ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  {speakingId === m.id ? "Stop" : "Read aloud"}
                </button>
                {m.calcSuggest && (
                  <button
                    type="button"
                    onClick={() =>
                      dispatchCalculatorEvent({
                        open: true,
                        expr: m.calcExpr ?? undefined,
                        label: contextLabel ? `Sprout · ${contextLabel}` : "From Tutor",
                        source: "tutor-chip",
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition"
                  >
                    <Calculator className="h-3 w-3" />
                    {m.calcExpr ? `Open Calculator (${m.calcExpr.slice(0, 22)})` : "Open Sprout Calculator"}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {stuckOpen && (
        <div
          role="dialog"
          aria-label="I'm stuck rescue options"
          className="px-3 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2 shrink-0"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <LifeBuoy className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" /> Stuck? Pick how you want me to help:
            </span>
            <button
              type="button"
              onClick={() => setStuckOpen(false)}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Hide
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STUCK_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setStuckOpen(false);
                  send(opt.prompt);
                }}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-brand-600 hover:text-brand-700 dark:hover:border-brand-400 dark:hover:text-brand-300 disabled:opacity-40 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0"
      >
        <button
          type="button"
          onClick={() => setStuckOpen((v) => !v)}
          aria-expanded={stuckOpen}
          aria-label="I'm stuck — show help options"
          title="I'm stuck — show help options"
          className={cn(
            "h-11 px-3 shrink-0 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors",
            stuckOpen
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-brand-600 hover:text-brand-700 dark:hover:border-brand-400"
          )}
        >
          <LifeBuoy className="h-4 w-4" />
          <span className="hidden sm:inline">I&apos;m stuck</span>
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Ask a question…"
          className="flex-1 resize-none max-h-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="h-11 w-11 shrink-0 rounded-xl bg-brand-600 text-white flex items-center justify-center disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
