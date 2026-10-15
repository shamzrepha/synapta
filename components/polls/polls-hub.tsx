"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ImagePlus, MessageCircle, Plus, Share2, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { api, timeAgo } from "@/lib/community/client";
import { uploadPostImage } from "@/lib/image-compress";
import { computeResults, POLL_LIMITS, type PollKind } from "@/lib/polls/logic";
import { cn } from "@/lib/utils";

interface Poll {
  id: string;
  question: string;
  kind: PollKind;
  options: { id: string; text: string; image: string | null; votes: number }[];
  totalVotes: number;
  commentCount: number;
  endsAt: string | null;
  closed: boolean;
  authorName: string;
  authorPhoto: string | null;
  createdAt: string | null;
  mine: boolean;
  myVote: string | null;
}
interface Comment { id: string; text: string; authorName: string; authorPhoto: string | null; mine: boolean; createdAt: string | null }

function Comments({ pollId }: { pollId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const load = useCallback(async () => {
    try {
      setItems(asArray<Comment>((await api<{ comments: Comment[] }>(`/api/polls/${pollId}/comments`)).comments));
    } catch {
      setItems([]);
    }
  }, [pollId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useLiveChannel(`poll:${pollId}`, load);
  const send = async () => {
    try {
      await api(`/api/polls/${pollId}/comments`, "POST", { text });
      setText("");
      await load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't comment", variant: "destructive" });
    }
  };
  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      {items === null && <Skeleton className="h-10 w-full" />}
      {items?.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar name={c.authorName} photoURL={c.authorPhoto} size={28} />
          <p className="min-w-0 flex-1 break-words rounded-2xl bg-slate-100 px-3 py-1.5 text-sm dark:bg-slate-900"><span className="font-semibold">{c.authorName}</span> <span className="text-[11px] text-slate-500">{timeAgo(c.createdAt)}</span><br />{c.text}</p>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Add a comment…" onKeyDown={(e) => e.key === "Enter" && text.trim() && send()} />
        <Button size="sm" onClick={send} disabled={!text.trim()}>Post</Button>
      </div>
    </div>
  );
}

function PollCard({ poll, onChanged, isAdmin, initiallyOpen }: { poll: Poll; onChanged: () => void; isAdmin: boolean; initiallyOpen?: boolean }) {
  const { toast } = useToast();
  const [comments, setComments] = useState(!!initiallyOpen);
  const [voting, setVoting] = useState(false);
  const showResults = poll.myVote !== null || poll.closed || poll.mine;
  const results = computeResults(poll.options);

  const vote = async (optionId: string) => {
    setVoting(true);
    try {
      await api(`/api/polls/${poll.id}/vote`, "POST", { optionId });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't vote", variant: "destructive" });
    }
    setVoting(false);
  };
  const share = async () => {
    try {
      await api(`/api/polls/${poll.id}/share`, "POST", {});
      toast({ title: "Shared to the feed", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't share", variant: "destructive" });
    }
  };
  const remove = async () => {
    if (!confirm("Delete this poll?")) return;
    try {
      await api(`/api/polls/${poll.id}`, "DELETE");
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't delete", variant: "destructive" });
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Avatar name={poll.authorName} photoURL={poll.authorPhoto} size={24} />
        <span className="font-semibold text-slate-700 dark:text-slate-300">{poll.authorName}</span>
        <span>{timeAgo(poll.createdAt)}</span>
        <Badge variant={poll.closed ? "secondary" : "emerald"} className="ml-auto">{poll.closed ? "Closed" : poll.endsAt ? `Closes ${new Date(poll.endsAt).toLocaleDateString()}` : "Open"}</Badge>
      </div>
      <p className="mt-2 break-words font-semibold">{poll.kind === "thisorthat" && "⚖️ "}{poll.question}</p>

      {poll.kind === "thisorthat" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {poll.options.map((o, i) => {
            const r = results[i];
            const mineVote = poll.myVote === o.id;
            return (
              <button key={o.id} type="button" disabled={showResults || voting} onClick={() => vote(o.id)} className={cn("relative flex min-h-[110px] flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 p-2 text-center text-sm font-semibold", mineVote ? "border-teal-600" : "border-slate-300 dark:border-slate-700", !showResults && "hover:border-teal-500")}>
                {o.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.image} alt="" className="h-20 w-full rounded-xl object-cover" />
                )}
                <span className="break-words">{o.text}</span>
                {showResults && <span className={cn("text-lg font-bold", r.leading ? "text-teal-600" : "text-slate-500")}>{r.percent}%</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {poll.options.map((o, i) => {
            const r = results[i];
            const mineVote = poll.myVote === o.id;
            return (
              <button key={o.id} type="button" disabled={showResults || voting} onClick={() => vote(o.id)} className={cn("relative flex min-h-[44px] w-full items-center overflow-hidden rounded-xl border px-3 text-left text-sm", mineVote ? "border-teal-600" : "border-slate-300 dark:border-slate-700", !showResults && "hover:border-teal-500")}>
                {showResults && <span className={cn("absolute inset-y-0 left-0 transition-all", r.leading ? "bg-teal-500/25" : "bg-slate-400/15")} style={{ width: `${r.percent}%` }} />}
                <span className="relative min-w-0 flex-1 break-words">{o.text}{mineVote && " ✓"}</span>
                {showResults && <span className="relative ml-2 font-semibold">{r.percent}%</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}{!showResults && " · vote to see results"}</p>

      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        <button type="button" onClick={() => setComments((c) => !c)} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-slate-800"><MessageCircle className="h-4 w-4" /> {poll.commentCount}</button>
        <button type="button" onClick={share} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-slate-800"><Share2 className="h-4 w-4" /> Share to feed</button>
        {(poll.mine || isAdmin) && <button type="button" onClick={remove} className="ml-auto flex min-h-[36px] items-center rounded-lg px-2 hover:text-rose-600" aria-label="Delete poll"><Trash2 className="h-4 w-4" /></button>}
      </div>
      {comments && <Comments pollId={poll.id} />}
    </Card>
  );
}

function Creator({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<PollKind>("poll");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<{ text: string; image: string | null }[]>([{ text: "", image: null }, { text: "", image: null }]);
  const [hours, setHours] = useState<number | null>(24);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);

  const pickKind = (k: PollKind) => {
    setKind(k);
    setOptions((o) => (k === "thisorthat" ? o.slice(0, 2) : o));
  };
  const setOpt = (i: number, patch: Partial<{ text: string; image: string | null }>) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const upload = async (i: number, f: File | undefined) => {
    if (!f) return;
    setUploading(i);
    try {
      const img = await uploadPostImage(f);
      setOpt(i, { image: img.url });
    } catch (e) {
      toast({ title: "Couldn't upload image", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setUploading(null);
  };
  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/polls", "POST", { question, kind, options, durationHours: hours });
      toast({ title: "Poll created", variant: "success" });
      onCreated();
    } catch (e) {
      toast({ title: "Couldn't create poll", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <Card className="space-y-3 border-teal-500 p-4">
      <div className="grid grid-cols-2 gap-2">
        {([["poll", "📊 Poll"], ["thisorthat", "⚖️ This or that"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => pickKind(k)} className={cn("min-h-[44px] rounded-xl border text-sm font-semibold", kind === k ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40" : "border-slate-300 dark:border-slate-700")}>{label}</button>
        ))}
      </div>
      <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={POLL_LIMITS.question} placeholder={kind === "poll" ? "Ask a question" : "Which would you rather?"} />
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} maxLength={POLL_LIMITS.option} placeholder={`Option ${i + 1}`} />
          {kind === "thisorthat" && (
            <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700" aria-label="Add image">
              {o.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.image} alt="" className="h-full w-full object-cover" />
              ) : uploading === i ? "…" : <ImagePlus className="h-4 w-4" />}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(i, e.target.files?.[0])} />
            </label>
          )}
          {kind === "poll" && options.length > POLL_LIMITS.minOptions && (
            <button type="button" onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} className="flex h-11 w-11 shrink-0 items-center justify-center" aria-label="Remove option"><X className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      {kind === "poll" && options.length < POLL_LIMITS.maxOptions && (
        <Button size="sm" variant="ghost" onClick={() => setOptions((o) => [...o, { text: "", image: null }])}><Plus className="mr-1 h-4 w-4" /> Add option</Button>
      )}
      <label className="block text-xs text-slate-500">
        Closes
        <select value={hours ?? ""} onChange={(e) => setHours(e.target.value ? Number(e.target.value) : null)} className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <option value="1">in 1 hour</option>
          <option value="24">in 1 day</option>
          <option value="72">in 3 days</option>
          <option value="168">in 1 week</option>
          <option value="">never</option>
        </select>
      </label>
      <div className="flex gap-2">
        <Button onClick={submit} isLoading={busy} disabled={question.trim().length < 3 || options.filter((o) => o.text.trim()).length < 2 || uploading !== null}>Create</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}

export function PollsHub({ isAdmin, focusId }: { isAdmin: boolean; focusId?: string | null }) {
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [focus, setFocus] = useState<Poll | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ polls: Poll[] }>(`/api/polls?status=${status}`);
      setPolls(asArray<Poll>(d.polls));
    } catch {
      setPolls((p) => p || []);
    }
  }, [status]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useLiveChannel("polls", load);

  const loadFocus = useCallback(async () => {
    if (!focusId) return;
    try {
      setFocus((await api<{ poll: Poll }>(`/api/polls/${focusId}`)).poll);
    } catch {
      setFocus(null);
    }
  }, [focusId]);
  useEffect(() => {
    const t = setTimeout(loadFocus, 0);
    return () => clearTimeout(t);
  }, [loadFocus]);
  useLiveChannel(focusId ? `poll:${focusId}` : null, loadFocus);

  const refresh = () => {
    load();
    loadFocus();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Polls & this-or-that 📊</h1>
          <p className="text-sm text-slate-500">Quick questions that start discussions.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New</Button>
      </div>
      {creating && <Creator onCreated={() => { setCreating(false); refresh(); }} onCancel={() => setCreating(false)} />}
      {focus && <PollCard key={`focus-${focus.id}`} poll={focus} onChanged={refresh} isAdmin={isAdmin} initiallyOpen />}
      <div className="flex gap-2">
        {(["open", "closed"] as const).map((s) => (
          <button key={s} type="button" onClick={() => { setStatus(s); setPolls(null); }} className={cn("min-h-[36px] rounded-full border px-3.5 text-xs font-semibold", status === s ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-700")}>{s === "open" ? "Open" : "Closed"}</button>
        ))}
      </div>
      {polls === null && <Skeleton className="h-36 w-full rounded-2xl" />}
      {polls && polls.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{status === "open" ? "No open polls. Start one!" : "No closed polls yet."}</p>}
      {polls?.filter((p) => p.id !== focus?.id).map((p) => <PollCard key={p.id} poll={p} onChanged={refresh} isAdmin={isAdmin} />)}
    </div>
  );
}
