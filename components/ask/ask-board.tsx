"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowBigUp, CheckCircle2, Flag, MessageCircle, Trash2, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { api, timeAgo } from "@/lib/community/client";
import { ASK_LIMITS } from "@/lib/ask/rules";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  text: string;
  subject: string | null;
  upvoteCount: number;
  answerCount: number;
  acceptedReplyId: string | null;
  createdAt: string | null;
  upvotedByMe: boolean;
  mine: boolean;
  authorUid?: string;
}
interface Reply {
  id: string;
  text: string;
  anonymous: boolean;
  authorName: string | null;
  authorPhoto: string | null;
  upvoteCount: number;
  upvotedByMe: boolean;
  createdAt: string | null;
  mine: boolean;
  authorUid?: string;
}

async function report(targetId: string, toast: ReturnType<typeof useToast>["toast"]) {
  const reason = prompt("Why are you reporting this? (e.g. bullying, spam, inappropriate)");
  if (!reason || reason.trim().length < 2) return;
  try {
    // goes through the existing reports mechanism; the target id never contains the author's identity
    await api("/api/reports", "POST", { targetType: "user", targetId, reason: reason.trim().slice(0, 120), description: `Report on anonymous ask content ${targetId}: ${reason.trim()}`.slice(0, 2000) });
    toast({ title: "Report sent", description: "Thanks, a moderator will take a look.", variant: "success" });
  } catch (e) {
    toast({ title: "Couldn't send report", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
  }
}

function Thread({ q, onChanged }: { q: Question; onChanged: () => void }) {
  const { toast } = useToast();
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [accepted, setAccepted] = useState<string | null>(q.acceptedReplyId);
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ question: Question; replies: Reply[] }>(`/api/ask/${q.id}`);
      setReplies(asArray<Reply>(d.replies));
      setAccepted(d.question.acceptedReplyId);
    } catch {
      setReplies([]);
    }
  }, [q.id]);

  useEffect(() => {
    // async callback, not a synchronous setState in the effect body
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useLiveChannel(`ask:${q.id}`, load);

  const send = async () => {
    setBusy(true);
    try {
      await api(`/api/ask/${q.id}/replies`, "POST", { text, anonymous: anon });
      setText("");
      await load();
      onChanged();
    } catch (e) {
      toast({ title: "Couldn't post reply", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };
  const upvote = async (r: Reply) => {
    try {
      await api(`/api/ask/${q.id}/upvote`, "POST", { replyId: r.id });
      await load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't upvote", variant: "destructive" });
    }
  };
  const accept = async (r: Reply) => {
    try {
      await api(`/api/ask/${q.id}/accept`, "POST", { replyId: accepted === r.id ? null : r.id });
      await load();
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't accept", variant: "destructive" });
    }
  };

  const sorted = [...(replies || [])].sort((a, b) => Number(b.id === accepted) - Number(a.id === accepted) || b.upvoteCount - a.upvoteCount);

  return (
    <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3 dark:border-slate-800">
      {replies === null && <Skeleton className="h-14 w-full rounded-xl" />}
      {replies && replies.length === 0 && <p className="text-xs text-slate-500">No answers yet. Be the first to help.</p>}
      {sorted.map((r) => (
        <div key={r.id} className={cn("flex gap-2.5 rounded-xl p-2.5", r.id === accepted ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-slate-50 dark:bg-slate-900")}>
          {r.anonymous ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300 dark:bg-slate-700"><EyeOff className="h-4 w-4" /></span>
          ) : (
            <Avatar name={r.authorName || "Learner"} photoURL={r.authorPhoto} size={32} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold">{r.anonymous ? "Anonymous" : r.authorName}</span>
              {r.mine && <Badge variant="outline">You</Badge>}
              {r.id === accepted && <span className="flex items-center gap-1 font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Accepted</span>}
              <span className="text-slate-500">{timeAgo(r.createdAt)}</span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{r.text}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
              <button type="button" onClick={() => upvote(r)} disabled={r.mine} className={cn("flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:bg-slate-200/70 dark:hover:bg-slate-800", r.upvotedByMe && "font-semibold text-teal-600")}>
                <ArrowBigUp className={cn("h-4 w-4", r.upvotedByMe && "fill-teal-500")} /> {r.upvoteCount}
              </button>
              {q.mine && !r.mine && (
                <button type="button" onClick={() => accept(r)} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 font-semibold text-emerald-600 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30">
                  <CheckCircle2 className="h-4 w-4" /> {r.id === accepted ? "Unaccept" : "Accept"}
                </button>
              )}
              {!r.mine && (
                <button type="button" onClick={() => report(`ask:${q.id}:${r.id}`, toast)} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:text-rose-600" aria-label="Report reply">
                  <Flag className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="space-y-2 pt-1">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={ASK_LIMITS.replyMax} placeholder="Write an answer…" rows={2} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-[36px] items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="h-4 w-4 accent-teal-600" /> Reply anonymously
          </label>
          <Button size="sm" className="ml-auto" onClick={send} isLoading={busy} disabled={text.trim().length < ASK_LIMITS.replyMin}>Reply</Button>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ q, onChanged, isAdmin }: { q: Question; onChanged: () => void; isAdmin: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const upvote = async () => {
    try {
      await api(`/api/ask/${q.id}/upvote`, "POST", {});
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't upvote", variant: "destructive" });
    }
  };
  const remove = async () => {
    if (!confirm("Delete this question?")) return;
    try {
      await api(`/api/ask/${q.id}`, "DELETE");
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't delete", variant: "destructive" });
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800"><EyeOff className="h-3.5 w-3.5" /></span>
        <span className="font-semibold text-slate-700 dark:text-slate-300">Anonymous{q.mine ? " (you)" : ""}</span>
        {q.subject && <Badge variant="outline">{q.subject}</Badge>}
        {q.acceptedReplyId && <Badge variant="emerald">Answered</Badge>}
        <span className="ml-auto">{timeAgo(q.createdAt)}</span>
      </div>
      {isAdmin && q.authorUid && <p className="mt-1 text-[11px] text-amber-600">Admin view: author {q.authorUid}</p>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{q.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <button type="button" onClick={upvote} disabled={q.mine} className={cn("flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-slate-800", q.upvotedByMe && "font-semibold text-teal-600")}>
          <ArrowBigUp className={cn("h-4 w-4", q.upvotedByMe && "fill-teal-500")} /> {q.upvoteCount}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <MessageCircle className="h-4 w-4" /> {q.answerCount} {q.answerCount === 1 ? "answer" : "answers"}
        </button>
        {!q.mine && (
          <button type="button" onClick={() => report(`ask:${q.id}`, toast)} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:text-rose-600" aria-label="Report question">
            <Flag className="h-3.5 w-3.5" />
          </button>
        )}
        {(q.mine || isAdmin) && (
          <button type="button" onClick={remove} className="ml-auto flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:text-rose-600" aria-label="Delete question">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && <Thread q={q} onChanged={onChanged} />}
    </Card>
  );
}

export function AskBoard({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [sort, setSort] = useState<"new" | "top" | "open">("new");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ questions: Question[] }>(`/api/ask?sort=${sort}`);
      setQuestions(asArray<Question>(d.questions));
    } catch {
      setQuestions([]);
    }
  }, [sort]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useLiveChannel("ask", load);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/ask", "POST", { text, subject: subject.trim() || null });
      setText("");
      setSubject("");
      toast({ title: "Posted anonymously", variant: "success" });
      await load();
    } catch (e) {
      toast({ title: "Couldn't post", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold">Anonymous ask 🙈</h1>
        <p className="text-sm text-slate-500">Ask anything. Nobody sees who you are, and be kind when you answer.</p>
      </div>
      <Card className="space-y-2 p-4">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={ASK_LIMITS.questionMax} rows={3} placeholder="What don't you understand?" />
        <div className="flex flex-wrap items-center gap-2">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={40} placeholder="Subject (optional)" className="max-w-[200px]" />
          <span className="ml-auto text-[11px] text-slate-500">{text.length}/{ASK_LIMITS.questionMax}</span>
          <Button onClick={submit} isLoading={busy} disabled={text.trim().length < ASK_LIMITS.questionMin}>Ask anonymously</Button>
        </div>
      </Card>
      <div className="flex gap-2">
        {(["new", "top", "open"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSort(s)} className={cn("min-h-[36px] rounded-full border px-3.5 text-xs font-semibold", sort === s ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-700")}>
            {s === "new" ? "New" : s === "top" ? "Top" : "Unanswered"}
          </button>
        ))}
      </div>
      {questions === null && <Skeleton className="h-28 w-full rounded-2xl" />}
      {questions && questions.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No questions yet. Be brave and ask the first one.</p>}
      {questions?.map((q) => <QuestionCard key={q.id} q={q} onChanged={load} isAdmin={isAdmin} />)}
    </div>
  );
}
