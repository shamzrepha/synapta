"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Star, Trophy, HelpCircle, Inbox, UserCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { api, timeAgo } from "@/lib/community/client";
import { TUTOR_LIMITS } from "@/lib/tutors/rules";
import { cn } from "@/lib/utils";

interface Tutor {
  uid: string;
  displayName: string;
  photoURL: string | null;
  subjects: string[];
  bio: string;
  availability: string;
  answered: number;
  ratingCount: number;
  rating: number | null;
  xpEarned: number;
  isMe: boolean;
}
interface Person { uid: string; displayName: string; photoURL: string | null }
interface Req {
  id: string;
  subject: string;
  question: string;
  status: "open" | "answered" | "rated";
  answer: string | null;
  rating: number | null;
  review: string | null;
  requester: Person | null;
  tutor: Person | null;
  requestedTutor: boolean;
  iAmRequester: boolean;
  createdAt: string | null;
}
interface MyProfile { subjects: string[]; bio: string; availability: string; active: boolean; answered: number; ratingCount: number; ratingSum: number; xpEarned: number }

type Tab = "find" | "leaderboard" | "mine" | "incoming" | "profile";
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "find", label: "Find a tutor", icon: HelpCircle },
  { id: "mine", label: "My requests", icon: Star },
  { id: "incoming", label: "Help others", icon: Inbox },
  { id: "leaderboard", label: "Top tutors", icon: Trophy },
  { id: "profile", label: "My profile", icon: UserCog },
];

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick} onClick={() => onPick?.(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={cn("p-1", onPick && "min-h-[36px] min-w-[36px]")}>
          <Star className={cn("h-5 w-5", n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600")} />
        </button>
      ))}
    </span>
  );
}

function RequestForm({ tutor, onDone, onCancel }: { tutor: Tutor | null; onDone: () => void; onCancel?: () => void }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(tutor?.subjects[0] || "");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/tutors/requests", "POST", { subject, question, tutorUid: tutor?.uid || null });
      toast({ title: tutor ? `Sent to ${tutor.displayName}` : "Question posted for tutors", variant: "success" });
      setQuestion("");
      onDone();
    } catch (e) {
      toast({ title: "Couldn't send", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };
  return (
    <div className="space-y-2">
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={40} placeholder="Subject (e.g. physics)" />
      <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={TUTOR_LIMITS.question} rows={3} placeholder="What do you need help with?" />
      <div className="flex gap-2">
        <Button onClick={submit} isLoading={busy} disabled={subject.trim().length < 2 || question.trim().length < 10}>{tutor ? "Send request" : "Ask the tutors"}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

function TutorCard({ t, rank, onAsk }: { t: Tutor; rank?: number; onAsk?: (t: Tutor) => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {rank && <span className="w-6 pt-2 text-center text-sm font-bold text-slate-500">{rank}</span>}
        <Avatar name={t.displayName} photoURL={t.photoURL} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.displayName}{t.isMe && <span className="text-xs font-normal text-slate-500"> (you)</span>}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {t.rating ?? "New"} {t.ratingCount > 0 && `(${t.ratingCount})`} · {t.answered} answered · {t.xpEarned} XP
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">{t.subjects.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
          {t.bio && <p className="mt-1.5 text-sm">{t.bio}</p>}
          {t.availability && <p className="mt-1 text-xs text-slate-500">Available: {t.availability}</p>}
        </div>
      </div>
      {onAsk && !t.isMe && <Button size="sm" variant="outline" className="mt-3" onClick={() => onAsk(t)}>Ask {t.displayName.split(" ")[0]}</Button>}
    </Card>
  );
}

function RequestCard({ r, mode, onChanged }: { r: Req; mode: "mine" | "incoming"; onChanged: () => void }) {
  const { toast } = useToast();
  const [answer, setAnswer] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Something went wrong", variant: "destructive" });
    }
    setBusy(false);
  };
  const other = mode === "mine" ? r.tutor : r.requester;
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge variant="outline">{r.subject}</Badge>
        <Badge variant={r.status === "open" ? "amber" : "emerald"}>{r.status === "open" ? "Waiting" : r.status === "answered" ? "Answered" : "Rated"}</Badge>
        {other && <span>{mode === "mine" ? "Tutor" : "From"}: <b>{other.displayName}</b></span>}
        <span className="ml-auto">{timeAgo(r.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm font-medium">{r.question}</p>
      {r.answer && (
        <div className="rounded-xl bg-teal-50 p-3 text-sm dark:bg-teal-950/30">
          <p className="mb-1 text-xs font-semibold text-teal-700 dark:text-teal-300">Answer</p>
          <p className="whitespace-pre-wrap break-words">{r.answer}</p>
        </div>
      )}
      {r.status === "rated" && r.rating && (
        <div className="text-sm"><Stars value={r.rating} />{r.review && <p className="text-xs text-slate-500">“{r.review}”</p>}</div>
      )}
      {mode === "mine" && r.status === "answered" && (
        <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-800">
          <p className="text-xs font-semibold">How helpful was this? (you can rate once)</p>
          <Stars value={rating} onPick={setRating} />
          <Input value={review} onChange={(e) => setReview(e.target.value)} maxLength={TUTOR_LIMITS.review} placeholder="Short review (optional)" />
          <Button size="sm" disabled={rating < 1} isLoading={busy} onClick={() => run(() => api(`/api/tutors/requests/${r.id}/rate`, "POST", { rating, review: review.trim() || undefined }))}>Submit rating</Button>
        </div>
      )}
      {mode === "incoming" && r.status === "open" && (
        <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-800">
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={TUTOR_LIMITS.answer} rows={3} placeholder="Explain it clearly…" />
          <Button size="sm" disabled={answer.trim().length < 5} isLoading={busy} onClick={() => run(() => api(`/api/tutors/requests/${r.id}/answer`, "POST", { answer }))}>Send answer</Button>
        </div>
      )}
    </Card>
  );
}

function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [subjects, setSubjects] = useState("");
  const [bio, setBio] = useState("");
  const [availability, setAvailability] = useState("");
  const [active, setActive] = useState(true);
  const [stats, setStats] = useState<MyProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ profile: MyProfile | null }>("/api/tutors/profile")
      .then((d) => {
        if (!alive) return;
        if (d.profile) {
          setSubjects(d.profile.subjects.join(", "));
          setBio(d.profile.bio);
          setAvailability(d.profile.availability);
          setActive(d.profile.active);
          setStats(d.profile);
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
      await api("/api/tutors/profile", "PUT", { subjects: subjects.split(",").map((s) => s.trim()).filter(Boolean), bio, availability, active });
      toast({ title: "Tutor profile saved", variant: "success" });
      onSaved();
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };
  if (!loaded) return <Skeleton className="h-48 w-full rounded-2xl" />;
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-slate-500">Tell classmates what you can help with. You earn XP when your answers are rated.</p>
      {stats && <p className="text-xs text-slate-500">{stats.answered} rated answers · {stats.xpEarned} XP earned</p>}
      <Input value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Subjects, comma separated (physics, maths)" />
      <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={TUTOR_LIMITS.bio} rows={3} placeholder="A short bio: what are you good at?" />
      <Input value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={TUTOR_LIMITS.availability} placeholder="Availability (e.g. weekdays after 4pm)" />
      <label className="flex min-h-[36px] items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-teal-600" /> Accepting questions</label>
      <Button onClick={save} isLoading={busy} disabled={!subjects.trim()}>Save profile</Button>
    </Card>
  );
}

export function TutorsHub({ initialTab }: { initialTab?: string | null }) {
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initialTab) ? (initialTab as Tab) : "find");
  const [tutors, setTutors] = useState<Tutor[] | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [subject, setSubject] = useState("");
  const [askTutor, setAskTutor] = useState<Tutor | null>(null);
  const [general, setGeneral] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === "find" || tab === "leaderboard") {
        const d = await api<{ tutors: Tutor[] }>(`/api/tutors?view=${tab === "find" ? "browse" : "leaderboard"}&subject=${encodeURIComponent(tab === "find" ? subject : "")}`);
        setTutors(asArray<Tutor>(d.tutors));
      } else if (tab === "mine" || tab === "incoming") {
        const d = await api<{ requests: Req[] }>(`/api/tutors/requests?view=${tab}`);
        setReqs(asArray<Req>(d.requests));
      }
    } catch {
      setTutors((t) => t || []);
      setReqs((r) => r || []);
    }
  }, [tab, subject]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useLiveChannel("tutors", load);

  const switchTab = (t: Tab) => {
    setTab(t);
    setTutors(null);
    setReqs(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold">Peer tutoring 🤝</h1>
        <p className="text-sm text-slate-500">Get help from classmates, or become a tutor and earn XP for great answers.</p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => switchTab(t.id)} className={cn("flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold", tab === t.id ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-700")}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "find" && (
        <>
          <Card className="space-y-2 p-4">
            {general ? (
              <RequestForm tutor={null} onDone={() => { setGeneral(false); switchTab("mine"); }} onCancel={() => setGeneral(false)} />
            ) : (
              <>
                <p className="text-sm">Not sure who to ask? Post your question for every matching tutor.</p>
                <Button size="sm" onClick={() => setGeneral(true)}>Post a help request</Button>
              </>
            )}
          </Card>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Filter tutors by subject" />
          {askTutor && (
            <Card className="space-y-2 border-teal-500 p-4">
              <p className="text-sm font-semibold">Ask {askTutor.displayName}</p>
              <RequestForm tutor={askTutor} onDone={() => { setAskTutor(null); switchTab("mine"); }} onCancel={() => setAskTutor(null)} />
            </Card>
          )}
        </>
      )}

      {(tab === "find" || tab === "leaderboard") && (
        <>
          {tutors === null && <Skeleton className="h-28 w-full rounded-2xl" />}
          {tutors && tutors.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No tutors here yet. Create a profile and be the first.</p>}
          {tutors?.map((t, i) => <TutorCard key={t.uid} t={t} rank={tab === "leaderboard" ? i + 1 : undefined} onAsk={tab === "find" ? setAskTutor : undefined} />)}
        </>
      )}

      {(tab === "mine" || tab === "incoming") && (
        <>
          {reqs === null && <Skeleton className="h-28 w-full rounded-2xl" />}
          {reqs && reqs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{tab === "mine" ? "You haven't asked for help yet." : "No questions for you right now. Check back soon, and make sure your tutor profile is active."}</p>}
          {reqs?.map((r) => <RequestCard key={r.id} r={r} mode={tab as "mine" | "incoming"} onChanged={load} />)}
        </>
      )}

      {tab === "profile" && <ProfileForm onSaved={() => switchTab("incoming")} />}
    </div>
  );
}
