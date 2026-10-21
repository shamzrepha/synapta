"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Repeat, Send, Square, Volume2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ExplainLevelToggle, useExplainLevel } from "@/components/study/explain-level-toggle";
import { useToast } from "@/components/ui/toast";
import { createSpeaker, type Speaker } from "@/lib/audio/speak";
import { collectTranscript, getRecognitionCtor, type RecognitionLike } from "@/lib/voice/speech";
import { MIC_HELP, checkMic, problemFromRecognitionError, type MicHelp } from "@/lib/voice/mic";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  role: "user" | "model";
  text: string;
  isError?: boolean;
}

const HOLD_MS = 450;

/** Talk to the tutor: hold or tap the mic, hear the answer, optionally loop hands-free. */
export function VoiceTutor() {
  const { toast } = useToast();
  const [level, setLevel] = useExplainLevel();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState("");
  const [handsFree, setHandsFree] = useState(false);
  const [typed, setTyped] = useState("");
  // why the microphone isn't working, with what to do about it
  const [micIssue, setMicIssue] = useState<MicHelp | null>(null);
  const checking = useRef(false);

  const recRef = useRef<RecognitionLike | null>(null);
  const heardRef = useRef("");
  const speakToken = useRef(0);
  const speaker = useRef<Speaker | null>(null);
  const emptyRuns = useRef(0);
  const handsFreeRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  const levelRef = useRef(level);
  const fns = useRef<{ send: (t: string) => void; listen: () => void }>({ send: () => {}, listen: () => {} });
  const downAt = useRef(0);
  const wasListening = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setSupported(Boolean(getRecognitionCtor(window))), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  useEffect(
    () => () => {
      speakToken.current++;
      recRef.current?.abort();
      speaker.current?.stop();
    },
    []
  );

  const stopSpeaking = () => {
    speakToken.current++;
    speaker.current?.stop();
    setSpeaking(false);
  };

  const speak = (markdown: string, onDone: () => void) => {
    speaker.current ||= createSpeaker();
    const token = ++speakToken.current;
    setSpeaking(true);
    speaker.current.say(
      markdown,
      () => {
        if (token !== speakToken.current) return; // stopped or superseded
        setSpeaking(false);
        onDone();
      },
      () => {
        if (token !== speakToken.current) return;
        setSpeaking(false);
        toast({ title: "The voice is busy", description: "Read the answer on screen, or ask again in a moment.", variant: "amber" });
      }
    );
  };

  const listen = async () => {
    const Ctor = getRecognitionCtor(window);
    if (!Ctor || recRef.current || checking.current) return;
    stopSpeaking();
    // Ask the browser for the microphone first: this shows the permission prompt and tells us exactly what is wrong
    // (blocked for the site, no microphone, another app using it) instead of a vague "blocked" later.
    checking.current = true;
    const mic = await checkMic();
    checking.current = false;
    if (!mic.ok) {
      setMicIssue({ problem: mic.problem, title: mic.title, help: mic.help });
      setHandsFree(false);
      return;
    }
    setMicIssue(null);
    if (recRef.current) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    heardRef.current = "";
    let failed = false;
    rec.onresult = (e) => {
      const { final, interim: part } = collectTranscript(e.results);
      heardRef.current = final || part;
      setInterim([final, part].filter(Boolean).join(" "));
    };
    rec.onerror = (e) => {
      failed = true;
      const problem = problemFromRecognitionError(e.error);
      if (problem && problem !== "unknown") {
        setMicIssue(MIC_HELP[problem]);
        setHandsFree(false);
      } else if (problem === "unknown") {
        toast({ title: "Couldn't hear that", description: "Try again or type your question.", variant: "amber" });
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim("");
      const heard = heardRef.current.trim();
      heardRef.current = "";
      if (heard) {
        emptyRuns.current = 0;
        fns.current.send(heard);
      } else if (handsFreeRef.current && !failed && ++emptyRuns.current < 3) {
        fns.current.listen();
      } else if (handsFreeRef.current) {
        emptyRuns.current = 0;
        setHandsFree(false);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const prior = messagesRef.current.filter((m) => !m.isError && m.text).slice(-12).map((m) => ({ role: m.role, parts: m.text }));
    const replyId = crypto.randomUUID();
    setMessages((p) => [...p, { id: crypto.randomUUID(), role: "user", text }, { id: replyId, role: "model", text: "" }]);
    setBusy(true);
    let reply = "";
    try {
      // never leave "Thinking…" up forever: after 50 seconds say so
      const res = await fetch("/api/ai/tutor", {
        signal: AbortSignal.timeout(50_000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // voice answers should be short and conversational
        body: JSON.stringify({ message: `${text}\n\n(Voice conversation: answer briefly and conversationally, no tables.)`, level: levelRef.current, history: prior }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "The tutor is unavailable right now. Please try again.");
      }
      reply = await res.text();
      setMessages((p) => p.map((m) => (m.id === replyId ? { ...m, text: reply } : m)));
    } catch (e) {
      const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      setMessages((p) => p.map((m) => (m.id === replyId ? { ...m, isError: true, text: timedOut ? "The tutor took too long to answer. The AI may be busy or at its limit. Try again in a minute." : e instanceof Error ? e.message : "The tutor is unavailable." } : m)));
    } finally {
      setBusy(false);
    }
    if (reply) speak(reply, () => handsFreeRef.current && fns.current.listen());
    else if (handsFreeRef.current) setHandsFree(false);
  };

  useEffect(() => {
    fns.current = { send, listen };
  });

  const stopListening = () => recRef.current?.stop();

  const onDown = () => {
    wasListening.current = Boolean(recRef.current);
    downAt.current = performance.now();
    if (!recRef.current && !busy) listen();
  };
  const onUp = () => {
    if (wasListening.current) stopListening(); // tap while listening = done talking
    else if (performance.now() - downAt.current > HOLD_MS) stopListening(); // release after a hold
    // a quick tap leaves the mic open until you stop talking
  };

  const canTalk = supported === true;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <ExplainLevelToggle value={level} onChange={setLevel} />
        <button
          type="button"
          onClick={() => setHandsFree((v) => !v)}
          aria-pressed={handsFree}
          disabled={!canTalk}
          className={cn("ml-auto h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40", handsFree ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-800 text-slate-500")}
        >
          <Repeat className="h-3.5 w-3.5" /> Hands-free {handsFree ? "on" : "off"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3 text-sm">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-2 text-slate-500">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-teal-500/10 flex items-center justify-center"><Mic className="h-7 w-7 text-teal-600" /></div>
            <p className="font-bold text-slate-800 dark:text-slate-100">Talk to your tutor</p>
            <p className="text-xs">{canTalk ? "Hold the mic while you speak, or tap it once and just talk." : supported === false ? "Voice input isn't supported in this browser — type your question below and the tutor will still read answers aloud." : ""}</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5",
                m.role === "user" ? "bg-teal-600 text-white" : m.isError ? "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300" : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              )}
            >
              {m.role === "model" && !m.text && !m.isError ? (
                <span className="flex items-center gap-2 text-slate-500 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</span>
              ) : m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.text}</p>
              ) : (
                <MarkdownRenderer content={m.text} />
              )}
            </div>
          </div>
        ))}
        {interim && (
          <div className="flex justify-end"><div className="max-w-[92%] rounded-2xl px-3.5 py-2.5 bg-teal-600/50 text-white italic">{interim}</div></div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-3">
        {micIssue && (
          <div role="alert" className="rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm space-y-2">
            <p className="font-bold text-rose-700 dark:text-rose-300">{micIssue.title}</p>
            <p className="text-xs text-rose-700/90 dark:text-rose-200/90 leading-relaxed">{micIssue.help}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setMicIssue(null); listen(); }} className="h-9 px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold">
                Check again
              </button>
              <button type="button" onClick={() => setMicIssue(null)} className="h-9 px-3 rounded-lg border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                I&apos;ll type instead
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-center gap-4">
          {speaking ? (
            <button type="button" onClick={stopSpeaking} className="h-12 px-4 rounded-full border border-rose-300 text-rose-600 text-sm font-semibold flex items-center gap-2">
              <Square className="h-4 w-4" /> Stop speaking
            </button>
          ) : (
            <span className="text-xs text-slate-500 h-12 flex items-center gap-1.5">
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</> : listening ? "Listening…" : canTalk ? <><Volume2 className="h-3.5 w-3.5" /> Hold or tap to talk</> : null}
            </span>
          )}
          <button
            type="button"
            disabled={!canTalk || busy}
            aria-label={listening ? "Stop listening" : "Talk"}
            aria-pressed={listening}
            onPointerDown={(e) => {
              e.preventDefault();
              onDown();
            }}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                e.preventDefault();
                if (recRef.current) stopListening();
                else listen();
              }
            }}
            className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center text-white shadow-lg select-none disabled:opacity-40",
              listening ? "bg-rose-500 animate-pulse" : "bg-teal-600"
            )}
            style={{ touchAction: "none" }}
          >
            {canTalk ? <Mic className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = typed;
            setTyped("");
            if (t.trim() && !busy) send(t);
          }}
          className="flex gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={1000}
            placeholder="…or type your question"
            className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:border-teal-500"
          />
          <button type="submit" disabled={busy || !typed.trim()} aria-label="Send" className="h-11 w-11 shrink-0 rounded-xl bg-teal-600 text-white flex items-center justify-center disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
