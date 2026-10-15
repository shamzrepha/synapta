"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Volume2, Square, Trash2, Loader2, GraduationCap } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  role: "user" | "model";
  text: string;
  isError?: boolean;
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
  compact = false,
}: {
  initialClassId?: string;
  initialKcId?: string;
  compact?: boolean;
}) {
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [topics, setTopics] = useState<TopicLite[]>([]);
  const [classId, setClassId] = useState(initialClassId);
  const [kcId, setKcId] = useState(initialKcId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    const history = messages.filter((m) => !m.isError && m.text).slice(-12).map((m) => ({ role: m.role, parts: m.text }));
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
    const replyId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: replyId, role: "model", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: classId || null, kcId: kcId || null, message: text, history }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "The tutor is unavailable right now. Please try again.");
      }
      const reply = await res.text();
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === replyId ? { ...m, text: reply } : m));
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

  const speak = (m: Msg) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speakingId === m.id) {
      setSpeakingId(null);
      return;
    }
    const u = new SpeechSynthesisUtterance(m.text.replace(/\$\$?([^$]+)\$\$?/g, "$1").replace(/[*_`#>]/g, ""));
    u.onend = () => setSpeakingId(null);
    u.onerror = () => setSpeakingId(null);
    setSpeakingId(m.id);
    window.speechSynthesis.speak(u);
  };

  const clear = () => {
    setMessages([]);
    save(key, []);
  };

  const contextLabel = kcId ? topics.find((t) => t.id === kcId)?.title : classId ? classes.find((c) => c.id === classId)?.title : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <GraduationCap className="h-4 w-4 text-teal-600 shrink-0" />
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
        {messages.length > 0 && (
          <button type="button" onClick={clear} className="ml-auto h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600" aria-label="Clear conversation" title="Clear conversation">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={cn("flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3", compact ? "text-sm" : "text-sm md:text-[15px]")}>
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-teal-500/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <p className="font-bold">Ask your AI tutor anything</p>
              <p className="text-xs text-slate-500 mt-1">
                {contextLabel ? `Focused on ${contextLabel}.` : "Any subject — or pick a class or topic above for answers grounded in your lessons."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300">
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
                  ? "bg-teal-600 text-white"
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
                <MarkdownRenderer content={m.text} />
              )}
            </div>
            {m.role === "model" && m.text && !m.isError && (
              <button type="button" onClick={() => speak(m)} className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 hover:text-teal-600">
                {speakingId === m.id ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {speakingId === m.id ? "Stop" : "Read aloud"}
              </button>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-3 border-t border-slate-100 dark:border-slate-800"
      >
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
          className="flex-1 resize-none max-h-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="h-11 w-11 shrink-0 rounded-xl bg-teal-600 text-white flex items-center justify-center disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
