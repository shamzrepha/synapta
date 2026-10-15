"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Users, Video, Check, Trash2, X, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useLiveChannel } from "@/lib/live/client";
import { formatCountdown, useNow } from "@/components/game/use-game";
import { cn } from "@/lib/utils";
import { asArray } from "@/lib/api/client";

export interface StudySession {
  id: string;
  classId: string;
  classTitle: string;
  title: string;
  description: string;
  hostUid: string;
  hostName: string;
  startAt: string;
  endAt: string;
  durationMin: number;
  status: "upcoming" | "starting_soon" | "live" | "ended";
  rsvpCount: number;
  attendeeCount: number;
  going: boolean;
  attended: boolean;
  isHost: boolean;
}

async function fetchSessions(classId?: string) {
  try {
    const res = await fetch(`/api/sessions${classId ? `?classId=${classId}` : ""}`);
    const data = await res.json();
    return data.ok ? (data.data as { sessions: StudySession[]; channels: string[] }) : null;
  } catch {
    return null;
  }
}

function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleForm({
  classes,
  onClose,
  onCreated,
}: {
  classes: Array<{ id: string; title: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return localInputValue(d);
  });
  const [duration, setDuration] = useState(60);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, title, description, startAt: new Date(startAt).toISOString(), durationMin: duration }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "Session scheduled", description: "Your classmates have been notified.", variant: "success" });
        onCreated();
      } else {
        toast({ title: "Couldn't schedule", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">Schedule a study session</p>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900">
          <X className="h-4 w-4" />
        </button>
      </div>
      {classes.length > 1 && (
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm">
          {asArray(classes).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      )}
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Exam revision: circuits" required minLength={3} maxLength={100} />
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What will you cover? (optional)" maxLength={1500} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm">
          {[30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" isLoading={saving} disabled={!classId}>
        Schedule & notify class
      </Button>
    </form>
  );
}

export function SessionsPanel({
  classId,
  classes,
  title = "Study sessions",
  compact = false,
  focusId,
}: {
  classId?: string;
  classes: Array<{ id: string; title: string }>;
  title?: string;
  compact?: boolean;
  focusId?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(1000);
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetchSessions(classId);
    if (d) {
      setSessions(d.sessions);
      setChannels(d.channels);
    }
  }, [classId]);

  useEffect(() => {
    fetchSessions(classId).then((d) => {
      setSessions(d?.sessions || []);
      setChannels(d?.channels || []);
    });
  }, [classId]);

  useLiveChannel(channels[0], load);
  useLiveChannel(channels[1], load);
  useLiveChannel(channels[2], load);

  const rsvp = async (s: StudySession) => {
    setSessions((prev) => (prev || []).map((x) => (x.id === s.id ? { ...x, going: !x.going, rsvpCount: x.rsvpCount + (x.going ? -1 : 1) } : x)));
    await fetch(`/api/sessions/${s.id}/rsvp`, { method: "POST" }).catch(() => null);
  };

  const join = async (s: StudySession) => {
    setJoining(s.id);
    try {
      const res = await fetch(`/api/sessions/${s.id}/join`, { method: "POST" });
      const data = await res.json();
      if (data.ok) router.push(`/lounge/${data.data.roomCode}`);
      else toast({ title: "Can't join yet", description: data.error?.message, variant: "destructive" });
    } finally {
      setJoining(null);
    }
  };

  const cancel = async (s: StudySession) => {
    if (!confirm(`Cancel “${s.title}”?`)) return;
    const res = await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
    if ((await res.json().catch(() => null))?.ok) load();
  };

  const visible = (sessions || []).filter((s) => (compact ? s.status !== "ended" : true)).slice(0, compact ? 4 : 50);

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-teal-600" /> {title}
        </p>
        {classes.length > 0 && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <CalendarPlus className="h-4 w-4 mr-1" /> Schedule
          </Button>
        )}
      </div>

      {showForm && (
        <ScheduleForm
          classes={classId ? classes.filter((c) => c.id === classId) : classes}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {sessions === null ? (
        <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse" />
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No sessions scheduled. Start one and study together!</p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((s) => {
            const live = s.status === "live";
            const soon = s.status === "starting_soon";
            const ended = s.status === "ended";
            const until = new Date(s.startAt).getTime() - now;
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-2xl border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3",
                  live ? "border-rose-500/50 bg-rose-500/5" : soon ? "border-amber-500/50 bg-amber-500/5" : "border-slate-200 dark:border-slate-800",
                  ended && "opacity-60",
                  focusId === s.id && "ring-2 ring-teal-500"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {live && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">LIVE</span>}
                    <p className="font-semibold">{s.title}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {!classId && `${s.classTitle} · `}
                    {new Date(s.startAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {s.durationMin} min · by{" "}
                    {s.isHost ? "you" : s.hostName}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <Users className="h-3.5 w-3.5" /> {s.rsvpCount} going{live || ended ? ` · ${s.attendeeCount} joined` : ""}
                    {!live && !ended && until > 0 && <span className="ml-2 font-semibold text-slate-700 dark:text-slate-300">in {formatCountdown(until)}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(live || soon) && (
                    <Button size="sm" onClick={() => join(s)} isLoading={joining === s.id} className={live ? "bg-rose-600 hover:bg-rose-700" : ""}>
                      <Video className="h-4 w-4 mr-1" /> Join room
                    </Button>
                  )}
                  {!live && !ended && !s.isHost && (
                    <Button size="sm" variant={s.going ? "default" : "outline"} onClick={() => rsvp(s)}>
                      {s.going ? <Check className="h-4 w-4 mr-1" /> : null} {s.going ? "Going" : "I'm going"}
                    </Button>
                  )}
                  {s.isHost && !ended && (
                    <button onClick={() => cancel(s)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600" aria-label="Cancel session">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
