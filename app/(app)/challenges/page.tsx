"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Swords, Plus, Zap, Hammer, Users, Timer, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateEventForm } from "@/components/events/create-event-form";
import { STATUS_STYLE, type EventSummary } from "@/components/events/types";
import { formatCountdown, useNow } from "@/components/game/use-game";
import { useLiveChannel } from "@/lib/live/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

async function fetchEvents(): Promise<{ events: EventSummary[]; channels: string[] } | null> {
  try {
    const res = await fetch("/api/events");
    const data = await res.json();
    return data.ok ? data.data : null;
  } catch {
    return null;
  }
}

function EventCard({ ev, now }: { ev: EventSummary; now: number }) {
  const s = STATUS_STYLE[ev.status];
  const target = ev.status === "upcoming" ? ev.startAt : ev.status === "live" ? ev.endAt : ev.status === "voting" ? ev.votingEndsAt : null;
  const label = ev.status === "upcoming" ? "Starts in" : ev.status === "live" ? (ev.kind === "hackathon" ? "Submissions close in" : "Ends in") : "Voting ends in";
  return (
    <Link href={`/challenges/${ev.id}`}>
      <Card className={cn("p-4 sm:p-5 h-full hover:border-teal-500/50 transition-all hover:-translate-y-0.5", ev.status === "live" && "border-rose-500/40 shadow-rose-500/10 shadow-lg")}>
        <div className="flex items-start justify-between gap-2">
          <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center", ev.kind === "hackathon" ? "bg-indigo-500/10" : "bg-amber-500/10")}>
            {ev.kind === "hackathon" ? <Hammer className="h-5 w-5 text-indigo-500" /> : <Zap className="h-5 w-5 text-amber-500" />}
          </div>
          <span className={cn("text-[10px] font-extrabold tracking-wider px-2 py-1 rounded-full", s.className)}>{s.label}</span>
        </div>
        <p className="font-bold mt-3 leading-snug">{ev.title}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {ev.kind === "hackathon" ? "Hackathon" : `Quiz sprint · ${ev.questionCount} Qs · ${ev.secondsPerQuestion}s each`}
          {ev.classTitle ? ` · ${ev.classTitle}` : " · Open to all"}
        </p>
        <div className="flex items-center justify-between mt-4 text-xs">
          <span className="flex items-center gap-1 text-slate-500">
            <Users className="h-3.5 w-3.5" /> {ev.participantCount} joined
          </span>
          {target ? (
            <span className="flex items-center gap-1 font-semibold">
              <Timer className="h-3.5 w-3.5" /> {label} {formatCountdown(new Date(target).getTime() - now)}
            </span>
          ) : (
            ev.results?.[0] && (
              <span className="flex items-center gap-1 font-semibold text-amber-600">
                <Trophy className="h-3.5 w-3.5" /> {ev.results[0].displayName}
              </span>
            )
          )}
        </div>
      </Card>
    </Link>
  );
}

export default function ChallengesPage() {
  const router = useRouter();
  const { user } = useUserStore();
  const now = useNow(1000);
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [myClasses, setMyClasses] = useState<Array<{ id: string; title: string }>>([]);
  const canCreate = user?.role === "teacher" || user?.role === "admin";

  useEffect(() => {
    fetchEvents().then((d) => {
      setEvents(d?.events || []);
      setChannels(d?.channels || []);
    });
  }, []);

  useEffect(() => {
    if (!canCreate) return;
    fetch("/api/classes?scope=mine")
      .then((r) => r.json())
      .then((j) => setMyClasses(asArray<{ id: string; title: string; isOwner?: boolean }>(j.ok ? j.data : []).filter((c) => c.isOwner !== false)))
      .catch(() => null);
  }, [canCreate]);

  const refresh = useCallback(() => {
    fetchEvents().then((d) => d && setEvents(d.events));
  }, []);
  // Listen to the public channel and up to two class channels (others refresh on focus)
  useLiveChannel(channels[0], refresh);
  useLiveChannel(channels[1], refresh);
  useLiveChannel(channels[2], refresh);

  const live = (events || []).filter((e) => e.status === "live" || e.status === "voting");
  const upcoming = (events || []).filter((e) => e.status === "upcoming");
  const ended = (events || []).filter((e) => e.status === "ended");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Swords className="h-7 w-7 text-rose-500" /> Challenges
          </h1>
          <p className="text-sm text-slate-500">Timed quiz sprints and hackathons. Compete, build, win XP.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New challenge
          </Button>
        )}
      </div>

      {events === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Swords className="h-10 w-10 mx-auto text-slate-300" />
          <p className="font-semibold">No challenges yet</p>
          <p className="text-sm text-slate-500">{canCreate ? "Launch a quiz sprint or hackathon for your class." : "Your teachers' challenges will appear here."}</p>
        </Card>
      ) : (
        <>
          {[
            { title: "🔴 Happening now", list: live },
            { title: "⏳ Coming up", list: upcoming },
            { title: "🏁 Finished", list: ended },
          ]
            .filter((g) => g.list.length > 0)
            .map((g) => (
              <section key={g.title} className="space-y-3">
                <h2 className="font-bold">{g.title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.list.map((ev) => (
                    <EventCard key={ev.id} ev={ev} now={now} />
                  ))}
                </div>
              </section>
            ))}
        </>
      )}

      {showCreate && (
        <CreateEventForm
          classes={myClasses}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            router.push(`/challenges/${id}`);
          }}
        />
      )}
    </div>
  );
}
