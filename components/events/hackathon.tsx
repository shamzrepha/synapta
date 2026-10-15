"use client";

import React, { useState } from "react";
import { ExternalLink, Code2, ThumbsUp, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { EventDetail } from "./types";

export function HackathonPanel({ detail, onChanged }: { detail: EventDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const ev = detail.event;
  const sub = detail.me?.submission;
  const [title, setTitle] = useState(sub?.title || "");
  const [summary, setSummary] = useState(sub?.summary || "");
  const [link, setLink] = useState(sub?.link || "");
  const [repoLink, setRepoLink] = useState(sub?.repoLink || "");
  const [saving, setSaving] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const canSubmit = detail.joined && ev.status === "live";
  const canVote = detail.canParticipate && (ev.status === "live" || ev.status === "voting");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${ev.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, link, repoLink: repoLink || null }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: sub ? "Submission updated" : "Project submitted! 🎉", variant: "success" });
        onChanged();
      } else {
        toast({ title: "Couldn't submit", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const vote = async (entryUid: string) => {
    setVoting(entryUid);
    try {
      const res = await fetch(`/api/events/${ev.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryUid }),
      });
      const data = await res.json();
      if (data.ok) onChanged();
      else toast({ title: "Vote not counted", description: data.error?.message, variant: "destructive" });
    } finally {
      setVoting(null);
    }
  };

  return (
    <div className="space-y-5">
      {canSubmit && (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <p className="font-bold">{sub ? "Update your submission" : "Submit your project"}</p>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project name" required minLength={2} maxLength={120} />
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="What did you build? How does it work? What did you learn?" required minLength={10} maxLength={3000} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Demo / project link (https://…)" required />
              <Input type="url" value={repoLink} onChange={(e) => setRepoLink(e.target.value)} placeholder="Code repo (optional)" />
            </div>
            <Button type="submit" isLoading={saving}>
              <Send className="h-4 w-4 mr-1.5" /> {sub ? "Save changes" : "Submit"}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Submissions ({detail.board.length})</h3>
          {canVote && <p className="text-xs text-slate-500">You have one vote — you can move it any time.</p>}
        </div>
        {detail.board.length === 0 ? (
          <Card className="p-8 text-center text-sm text-slate-500">No projects yet. Be the first to ship!</Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {detail.board.map((e) => {
              const mine = e.isMe;
              const voted = detail.myVote === e.uid;
              return (
                <Card key={e.uid} className={cn("p-4 space-y-3", voted && "border-teal-500", e.rank === 1 && ev.status === "ended" && "border-amber-400")}>
                  <div className="flex items-start gap-3">
                    <Avatar name={e.displayName} photoURL={e.photoURL} seed={e.uid} size={36} level={e.level} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">{e.title}</p>
                      <p className="text-xs text-slate-500">
                        by {mine ? "you" : e.displayName}
                        {ev.status === "ended" && e.rank <= 3 ? ` · ${["🥇", "🥈", "🥉"][e.rank - 1]} #${e.rank}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums">{e.score} 👍</span>
                  </div>
                  {e.summary && <MarkdownRenderer content={e.summary} className="prose-p:my-1 text-sm" />}
                  <div className="flex flex-wrap items-center gap-2">
                    {e.link && (
                      <a href={e.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-300 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                    )}
                    {e.repoLink && (
                      <a href={e.repoLink} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                        <Code2 className="h-3.5 w-3.5" /> Code
                      </a>
                    )}
                    {canVote && !mine && (
                      <Button size="sm" variant={voted ? "default" : "outline"} className="ml-auto" onClick={() => vote(e.uid)} isLoading={voting === e.uid}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> {voted ? "Voted" : "Vote"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
