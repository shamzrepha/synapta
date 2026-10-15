"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, timeAgo } from "@/lib/community/client";
import { AVAILABILITY_SLOTS, MAX_LEVEL, MIN_LEVEL, type MentorRole } from "@/lib/mentors/matching";
import { cn } from "@/lib/utils";

interface Profile { role: MentorRole; subjects: string[]; level: number; availability: string[]; bio: string; active: boolean }
interface MatchRow {
  uid: string;
  role: MentorRole;
  displayName: string;
  photoURL: string | null;
  level: number;
  subjects: string[];
  bio: string;
  reasons: string[];
  score: number;
}
interface Req {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  message: string;
  direction: "sent" | "received";
  myRole: MentorRole;
  other: { uid: string; displayName: string; photoURL: string | null };
  chatId: string | null;
  createdAt: string | null;
}
interface Checkin { id: string; text: string; topic: string; authorName: string; mine: boolean; createdAt: string | null }

type Tab = "matches" | "requests" | "pairs" | "profile";

function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<MentorRole>("mentee");
  const [subjects, setSubjects] = useState("");
  const [level, setLevel] = useState(9);
  const [availability, setAvailability] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ profile: Profile | null }>("/api/mentors/profile")
      .then((d) => {
        if (!alive) return;
        if (d.profile) {
          setRole(d.profile.role);
          setSubjects(d.profile.subjects.join(", "));
          setLevel(d.profile.level);
          setAvailability(d.profile.availability);
          setBio(d.profile.bio);
          setActive(d.profile.active);
        }
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/mentors/profile", "PUT", { role, subjects: subjects.split(",").map((s) => s.trim()).filter(Boolean), level, availability, bio, active });
      toast({ title: "Profile saved", variant: "success" });
      onSaved();
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };
  if (!loaded) return <Skeleton className="h-60 w-full rounded-2xl" />;
  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        {(["mentee", "mentor"] as const).map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)} className={cn("min-h-[48px] rounded-xl border px-3 text-sm font-semibold", role === r ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40" : "border-slate-300 dark:border-slate-700")}>
            {r === "mentee" ? "🌱 I want a mentor" : "🧭 I want to mentor"}
          </button>
        ))}
      </div>
      <Input value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Subjects, comma separated (physics, maths)" />
      <label className="block text-sm">
        Year / grade: <b>{level}</b>
        <input type="range" min={MIN_LEVEL} max={MAX_LEVEL} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="mt-1 block h-8 w-full accent-teal-600" />
      </label>
      <p className="text-xs text-slate-500">Mentors need to be at least one year or grade above their mentee.</p>
      <div className="flex flex-wrap gap-2">
        {AVAILABILITY_SLOTS.map((s) => {
          const on = availability.includes(s.id);
          return (
            <button key={s.id} type="button" onClick={() => setAvailability((a) => (on ? a.filter((x) => x !== s.id) : [...a, s.id]))} className={cn("min-h-[36px] rounded-full border px-3 text-xs font-semibold", on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-700")}>
              {s.label}
            </button>
          );
        })}
      </div>
      <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={2} placeholder="A line about you (optional)" />
      <label className="flex min-h-[36px] items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-teal-600" /> Show me in matches</label>
      <Button onClick={save} isLoading={busy} disabled={!subjects.trim()}>Save and find matches</Button>
    </Card>
  );
}

function CheckIns({ id }: { id: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Checkin[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setItems(asArray<Checkin>((await api<{ checkins: Checkin[] }>(`/api/mentors/requests/${id}/checkins`)).checkins));
    } catch {
      setItems([]);
    }
  }, [id]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  const add = async () => {
    setBusy(true);
    try {
      await api(`/api/mentors/requests/${id}/checkins`, "POST", { text });
      setText("");
      await load();
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };
  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <p className="text-xs font-semibold">Check-in log</p>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="What did you work on today?" />
        <Button size="sm" onClick={add} isLoading={busy} disabled={text.trim().length < 2}>Log</Button>
      </div>
      {items === null && <Skeleton className="h-10 w-full" />}
      {items?.map((c) => (
        <p key={c.id} className="text-sm"><span className="font-semibold">{c.mine ? "You" : c.authorName}</span> <span className="text-xs text-slate-500">{timeAgo(c.createdAt)}</span><br />{c.text}</p>
      ))}
      {items && items.length === 0 && <p className="text-xs text-slate-500">No check-ins yet.</p>}
    </div>
  );
}

export function MentorsHub({ initialTab }: { initialTab?: string | null }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(["matches", "requests", "pairs", "profile"].includes(initialTab || "") ? (initialTab as Tab) : "matches");
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [msgFor, setMsgFor] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      if (tab === "matches") {
        const d = await api<{ matches: MatchRow[]; hasProfile: boolean }>("/api/mentors/matches");
        setMatches(asArray<MatchRow>(d.matches));
        setHasProfile(d.hasProfile);
      } else if (tab === "requests" || tab === "pairs") {
        setReqs(asArray<Req>((await api<{ requests: Req[] }>("/api/mentors/requests")).requests));
      }
    } catch {
      setMatches((m) => m || []);
      setReqs((r) => r || []);
    }
  }, [tab]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setMatches(null);
    setReqs(null);
  };

  const request = async (uid: string) => {
    try {
      await api("/api/mentors/requests", "POST", { toUid: uid, message: msg });
      toast({ title: "Request sent", variant: "success" });
      setMsgFor(null);
      setMsg("");
      await load();
    } catch (e) {
      toast({ title: "Couldn't send", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  const act = async (id: string, action: "accept" | "decline" | "cancel") => {
    try {
      await api(`/api/mentors/requests/${id}`, "POST", { action });
      await load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't update", variant: "destructive" });
    }
  };

  const pending = (reqs || []).filter((r) => r.status === "pending");
  const pairs = (reqs || []).filter((r) => r.status === "accepted");

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold">Mentor matching 🧭</h1>
        <p className="text-sm text-slate-500">Seniors paired with juniors by subject, level and when you are free.</p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {([["matches", "Matches"], ["requests", "Requests"], ["pairs", "My pairs"], ["profile", "My profile"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => switchTab(id)} className={cn("min-h-[36px] shrink-0 rounded-full border px-3.5 text-xs font-semibold", tab === id ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-700")}>{label}</button>
        ))}
      </div>

      {tab === "profile" && <ProfileForm onSaved={() => switchTab("matches")} />}

      {tab === "matches" && (
        <>
          {matches === null && <Skeleton className="h-32 w-full rounded-2xl" />}
          {matches && !hasProfile && (
            <Card className="space-y-2 p-4 text-center">
              <p className="text-sm">Set up your profile to see suggested matches.</p>
              <Button size="sm" onClick={() => switchTab("profile")}>Create profile</Button>
            </Card>
          )}
          {matches && hasProfile && matches.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No matches yet. Add more subjects or check back later.</p>}
          {matches?.map((m) => (
            <Card key={m.uid} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={m.displayName} photoURL={m.photoURL} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.displayName} <Badge variant="outline">{m.role} · level {m.level}</Badge></p>
                  <div className="mt-1 flex flex-wrap gap-1">{m.subjects.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                  {m.bio && <p className="mt-1 text-sm">{m.bio}</p>}
                  <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">{m.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul>
                </div>
              </div>
              {msgFor === m.uid ? (
                <div className="mt-3 space-y-2">
                  <Input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} placeholder="Say hi (optional)" />
                  <div className="flex gap-2"><Button size="sm" onClick={() => request(m.uid)}>Send request</Button><Button size="sm" variant="ghost" onClick={() => setMsgFor(null)}>Cancel</Button></div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setMsgFor(m.uid)}>Ask to be {m.role === "mentor" ? "my mentor" : "my mentee"}</Button>
              )}
            </Card>
          ))}
        </>
      )}

      {tab === "requests" && (
        <>
          {reqs === null && <Skeleton className="h-20 w-full rounded-2xl" />}
          {reqs && reqs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No requests yet.</p>}
          {reqs?.map((r) => (
            <Card key={r.id} className="flex items-center gap-3 p-4">
              <Avatar name={r.other.displayName} photoURL={r.other.photoURL} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.other.displayName}</p>
                <p className="text-xs text-slate-500">{r.direction === "sent" ? "You asked" : "Asked you"} · {r.myRole === "mentor" ? "you would mentor" : "you would be mentored"} · {timeAgo(r.createdAt)}</p>
                {r.message && <p className="mt-0.5 text-sm">“{r.message}”</p>}
              </div>
              {r.status === "pending" && r.direction === "received" && (
                <div className="flex flex-col gap-1"><Button size="sm" onClick={() => act(r.id, "accept")}>Accept</Button><Button size="sm" variant="ghost" onClick={() => act(r.id, "decline")}>Decline</Button></div>
              )}
              {r.status === "pending" && r.direction === "sent" && <Button size="sm" variant="ghost" onClick={() => act(r.id, "cancel")}>Cancel</Button>}
              {r.status !== "pending" && <Badge variant={r.status === "accepted" ? "emerald" : "secondary"}>{r.status}</Badge>}
            </Card>
          ))}
          {reqs && pending.length === 0 && reqs.length > 0 && <p className="text-center text-xs text-slate-500">Nothing waiting on you.</p>}
        </>
      )}

      {tab === "pairs" && (
        <>
          {reqs === null && <Skeleton className="h-20 w-full rounded-2xl" />}
          {reqs && pairs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No active pairs yet. Accepted requests show up here.</p>}
          {pairs.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar name={r.other.displayName} photoURL={r.other.photoURL} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.other.displayName}</p>
                  <p className="text-xs text-slate-500">You are the {r.myRole}</p>
                </div>
                {r.chatId && <Link href={`/messages?chat=${r.chatId}`} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-slate-700"><MessageSquare className="h-3.5 w-3.5" /> Chat</Link>}
                <Button size="sm" variant="ghost" onClick={() => setOpenLog(openLog === r.id ? null : r.id)}>Check-ins</Button>
              </div>
              {openLog === r.id && <CheckIns id={r.id} />}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
