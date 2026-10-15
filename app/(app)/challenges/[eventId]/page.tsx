"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, Timer, Trophy, Hammer, Zap, Crown, Trash2, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { QuizSprintPlayer } from "@/components/events/quiz-sprint";
import { HackathonPanel } from "@/components/events/hackathon";
import { BuildChallengePanel } from "@/components/events/build-challenge";
import { STATUS_STYLE, type EventDetail } from "@/components/events/types";
import { ShareButton } from "@/components/social/share-button";
import { formatCountdown, useNow } from "@/components/game/use-game";
import { useLiveChannel } from "@/lib/live/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

async function fetchDetail(id: string): Promise<EventDetail | null | "error"> {
  try {
    const res = await fetch(`/api/events/${id}`);
    const data = await res.json();
    return data.ok ? data.data : "error";
  } catch {
    return null;
  }
}

export default function ChallengePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(1000);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [ending, setEnding] = useState(false);
  const [clockSkew, setClockSkew] = useState(0);

  const apply = useCallback((d: EventDetail | null | "error") => {
    if (d === "error") setFailed(true);
    else if (d) {
      setDetail(d);
      setClockSkew(new Date(d.serverNow).getTime() - Date.now());
    }
  }, []);

  useEffect(() => {
    fetchDetail(eventId).then(apply);
  }, [eventId, apply]);

  const refresh = useCallback(() => {
    fetchDetail(eventId).then(apply);
  }, [eventId, apply]);
  useLiveChannel(`event:${eventId}`, refresh, 600);

  // Flip status exactly at start/end without waiting for a signal
  const ev = detail?.event;
  const serverNow = now + clockSkew;
  const boundary = ev ? (ev.status === "upcoming" ? ev.startAt : ev.status === "live" ? ev.endAt : ev.status === "voting" ? ev.votingEndsAt : null) : null;
  const msLeft = boundary ? new Date(boundary).getTime() - serverNow : null;
  useEffect(() => {
    if (msLeft === null || msLeft > 0) return;
    const t = setTimeout(refresh, 800);
    return () => clearTimeout(t);
  }, [msLeft !== null && msLeft <= 0, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="font-bold">This challenge isn&apos;t available.</p>
        <Link href="/challenges">
          <Button variant="outline">Back to challenges</Button>
        </Link>
      </div>
    );
  }
  if (!detail || !ev) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const join = async () => {
    setJoining(true);
    try {
      const res = await fetch(`/api/events/${eventId}/join`, { method: "POST" });
      const data = await res.json();
      if (data.ok) refresh();
      else toast({ title: "Couldn't join", description: data.error?.message, variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const endNow = async () => {
    const msg =
      ev.kind === "hackathon" && ev.status === "live"
        ? "Close submissions now and open voting?"
        : "End this challenge now and award the results?";
    if (!confirm(msg)) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/events/${eventId}/finalize`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) toast({ title: "Couldn't end it", description: data.error?.message, variant: "destructive" });
      refresh();
    } finally {
      setEnding(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this challenge for everyone?")) return;
    const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) router.push("/challenges");
    else toast({ title: "Couldn't delete", description: data.error?.message, variant: "destructive" });
  };

  const s = STATUS_STYLE[ev.status];
  const timerLabel = ev.status === "upcoming" ? "Starts in" : ev.status === "live" ? (ev.kind === "hackathon" ? "Submissions close in" : "Ends in") : "Voting ends in";
  const isQuiz = ev.kind === "quiz_sprint";
  const isBuild = ev.kind === "build";

  return (
    <div className="space-y-5">
      <Link href="/challenges" className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4 mr-1" /> All challenges
      </Link>

      <Card className={cn("p-5 sm:p-6 overflow-hidden relative", isQuiz ? "bg-gradient-to-br from-amber-500/10 to-rose-500/10" : "bg-gradient-to-br from-indigo-500/10 to-teal-500/10")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn("text-[10px] font-extrabold tracking-wider px-2 py-1 rounded-full", s.className)}>{s.label}</span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                {isQuiz ? <Zap className="h-3.5 w-3.5 text-amber-500" /> : <Hammer className="h-3.5 w-3.5 text-indigo-500" />}
                {isQuiz ? `Quiz sprint · ${ev.questionCount} questions · ${ev.secondsPerQuestion}s each` : isBuild ? `Build challenge · ${ev.build?.designKind === "circuit" ? "circuit + code" : "mechanism"}` : "Hackathon"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{ev.title}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Hosted by {ev.hostName}
              {ev.classTitle ? ` · ${ev.classTitle}` : " · open to everyone"}
            </p>
          </div>
          {msLeft !== null && msLeft > 0 && (
            <div className="text-right">
              <p className="text-[11px] uppercase font-semibold text-slate-500">{timerLabel}</p>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums flex items-center gap-1.5 justify-end">
                <Timer className="h-6 w-6" /> {formatCountdown(msLeft)}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" /> {ev.participantCount} joined
          </span>
          <span className="flex items-center gap-1">
            <Trophy className="h-4 w-4 text-amber-500" /> {ev.rewards.first} / {ev.rewards.second} / {ev.rewards.third} XP · +{ev.rewards.participation} for taking part
          </span>
          <span className="ml-auto">
            <ShareButton
              label="Invite"
              item={{ type: "event", id: ev.id, title: ev.title, subtitle: `${ev.kind === "hackathon" ? "Hackathon" : ev.kind === "build" ? "Build challenge" : "Quiz sprint"} · ${ev.participantCount} joined`, href: `/challenges/${ev.id}`, emoji: ev.kind === "hackathon" ? "🛠️" : "⚡" }}
            />
          </span>
        </div>
        {detail.canManage && !ev.finalized && (
          <div className="flex flex-wrap gap-2 mt-4">
            {ev.status !== "upcoming" && ev.status !== "ended" && (
              <Button size="sm" variant="outline" onClick={endNow} isLoading={ending}>
                <Flag className="h-4 w-4 mr-1" /> {ev.kind === "hackathon" && ev.status === "live" ? "Close submissions" : "End now & award"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={remove} className="text-rose-600">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5 min-w-0">
          {ev.description && (
            <Card className="p-5">
              <MarkdownRenderer content={ev.description} />
            </Card>
          )}

          {!detail.joined && (ev.status === "upcoming" || ev.status === "live") && detail.canParticipate && (
            <Card className="p-6 text-center space-y-3">
              <p className="text-4xl">{isQuiz ? "⚡" : "🛠️"}</p>
              <p className="font-bold">{ev.status === "upcoming" ? "Join now and get notified when it starts" : "Jump in!"}</p>
              <Button size="lg" onClick={join} isLoading={joining}>
                Join {isQuiz ? "the sprint" : isBuild ? "and start building" : "the hackathon"}
              </Button>
            </Card>
          )}

          {isQuiz && detail.joined && ev.status === "upcoming" && (
            <Card className="p-8 text-center space-y-2">
              <p className="text-4xl">⏳</p>
              <p className="font-bold">You&apos;re in! The sprint starts in {formatCountdown(msLeft || 0)}.</p>
              <p className="text-sm text-slate-500">Keep this page open — it starts automatically.</p>
            </Card>
          )}

          {isQuiz && detail.joined && ev.status === "live" && (
            <Card className="p-4 sm:p-6">
              {detail.me?.finished ? (
                <div className="text-center py-8 space-y-1">
                  <p className="text-4xl">🏁</p>
                  <p className="font-bold text-lg">Finished with {detail.me.score.toLocaleString()} points</p>
                  <p className="text-sm text-slate-500">
                    {detail.me.correct}/{detail.me.answered} correct. Results are awarded when the sprint ends.
                  </p>
                </div>
              ) : (
                <QuizSprintPlayer eventId={eventId} onProgress={refresh} />
              )}
            </Card>
          )}

          {!isQuiz && !isBuild && <HackathonPanel detail={detail} onChanged={refresh} />}
          {isBuild && <BuildChallengePanel detail={detail} onChanged={refresh} />}

          {ev.status === "ended" && ev.results && ev.results.length > 0 && (
            <Card className="p-5 space-y-3">
              <p className="font-bold flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" /> Winners
              </p>
              <ol className="space-y-2">
                {ev.results.slice(0, 3).map((r) => (
                  <li key={r.uid} className="flex items-center gap-3">
                    <span className="text-2xl">{["🥇", "🥈", "🥉"][r.rank - 1]}</span>
                    <span className="font-semibold flex-1">{r.displayName}</span>
                    <span className="text-sm font-bold">{r.score.toLocaleString()} {isQuiz || isBuild ? "pts" : "votes"}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {isQuiz && (
          <Card className="p-0 overflow-hidden lg:sticky lg:top-20">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="font-bold text-sm flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-amber-500" /> Live leaderboard
              </p>
              {ev.status === "live" && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" aria-label="live" />}
            </div>
            {detail.board.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No one yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[60vh] overflow-y-auto">
                {detail.board.map((r) => (
                  <li key={r.uid} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors", r.isMe && "bg-teal-500/10")}>
                    <span className="w-6 text-center text-sm font-bold text-slate-500">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
                    <Avatar name={r.displayName} photoURL={r.photoURL} seed={r.uid} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{r.isMe ? "You" : r.displayName}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.correct}/{r.answered} correct{r.finished ? " · done" : ""}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums">{r.score.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
