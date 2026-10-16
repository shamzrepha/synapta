"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, ChevronDown, ChevronUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg, localDay, send } from "@/lib/study/client";
import { daysUntil, planProgress, type PlanDay } from "@/lib/exams/schedule";
import { cn } from "@/lib/utils";

interface Exam {
  id: string;
  name: string;
  examDate: string;
  minutesPerDay: number;
  topics: Array<{ name: string; mastery?: number | null }>;
  plan: PlanDay[];
  done: Record<string, boolean>;
}
interface MyClass { id: string; title: string }

function niceDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function ExamsPage() {
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [today] = useState(() => localDay());

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    api<{ items: Exam[] }>("/api/study/exams")
      .then((d) => alive && setExams(asArray<Exam>(d.items).map((e) => ({ ...e, plan: asArray<PlanDay>(e.plan), done: e.done || {} }))))
      .catch((e) => {
        if (!alive) return;
        setExams((p) => p ?? []);
        toast({ title: "Couldn't load exams", description: errMsg(e), variant: "destructive" });
      });
    return () => {
      alive = false;
    };
  }, [tick, toast]);

  const patch = (e: Exam) => setExams((p) => (p || []).map((x) => (x.id === e.id ? e : x)));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2"><CalendarClock className="h-7 w-7 text-teal-600" /> Exam planner</h1>
        <p className="text-sm text-slate-500">Tell us the exam and we plan your revision backwards from it, giving weaker topics more time.</p>
      </div>
      {!adding ? (
        <Button className="w-full" size="lg" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-2" /> Add an exam</Button>
      ) : (
        <NewExam today={today} onDone={(created) => { setAdding(false); if (created) load(); }} />
      )}
      {exams === null && <Skeleton className="h-32 w-full" />}
      {exams && exams.length === 0 && !adding && <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4">No exams yet.</p>}
      {(exams || []).map((e) => (
        <ExamCard key={e.id} exam={e} today={today} onChange={patch} onDeleted={() => setExams((p) => (p || []).filter((x) => x.id !== e.id))} />
      ))}
    </div>
  );
}

function NewExam({ today, onDone }: { today: string; onDone: (created: boolean) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("1");
  const [topicText, setTopicText] = useState("");
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<MyClass[]>("/api/classes?scope=mine")
      .then((c) => alive && setClasses(asArray<MyClass>(c)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const topics = topicText.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
  const ok = name.trim() && date > today && (topics.length > 0 || picked.length > 0) && Number(hours) > 0;

  const create = async () => {
    setBusy(true);
    try {
      await send("/api/study/exams", { name: name.trim(), examDate: date, today, minutesPerDay: Math.round(Number(hours) * 60), topics, classIds: picked });
      onDone(true);
    } catch (e) {
      toast({ title: "Couldn't create the plan", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exam name (e.g. Biology midterm)" maxLength={80} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500 space-y-1">Exam date<Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-xs text-slate-500 space-y-1">Hours per day<Input type="number" inputMode="decimal" min={0.25} max={8} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} /></label>
      </div>
      {classes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">Include all topics from your classes (uses your mastery to find weak spots)</p>
          <div className="flex flex-wrap gap-1.5">
            {asArray(classes).map((c) => (
              <button key={c.id} type="button" onClick={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id].slice(0, 5)))} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold border", picked.includes(c.id) ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 dark:border-slate-700")}>{c.title}</button>
            ))}
          </div>
        </div>
      )}
      <textarea value={topicText} onChange={(e) => setTopicText(e.target.value)} rows={3} placeholder="Other topics, separated by commas or new lines" className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!ok} isLoading={busy} onClick={() => void create()}>Build my plan</Button>
        <Button variant="outline" onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

function ExamCard({ exam, today, onChange, onDeleted }: { exam: Exam; today: string; onChange: (e: Exam) => void; onDeleted: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const left = daysUntil(exam.examDate, today);
  const prog = planProgress(exam.plan, exam.done, today);

  const toggle = async (id: string, done: boolean) => {
    onChange({ ...exam, done: { ...exam.done, [id]: done } });
    try {
      await send(`/api/study/exams/${exam.id}`, { action: "toggle", itemId: id, done }, "PATCH");
    } catch (e) {
      onChange(exam);
      toast({ title: "Couldn't save", description: errMsg(e), variant: "destructive" });
    }
  };

  const reschedule = async () => {
    try {
      const r = await send<{ plan: PlanDay[] }>(`/api/study/exams/${exam.id}`, { action: "reschedule", today }, "PATCH");
      onChange({ ...exam, plan: asArray<PlanDay>(r.plan) });
      toast({ title: "Plan updated", description: "Missed work moved to the days ahead.", variant: "success" });
    } catch (e) {
      toast({ title: "Couldn't reschedule", description: errMsg(e), variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the plan for "${exam.name}"?`)) return;
    try {
      await api(`/api/study/exams/${exam.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast({ title: "Couldn't delete", description: errMsg(e), variant: "destructive" });
    }
  };

  const visible = exam.plan.filter((d) => d.items.length > 0 && (d.date >= today || d.items.some((i) => !exam.done[i.id])));
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight break-words">{exam.name}</p>
          <p className="text-xs text-slate-500">{niceDate(exam.examDate)} · {Math.round(exam.minutesPerDay / 6) / 10} h/day · {exam.topics.length} topics</p>
        </div>
        <div className={cn("rounded-xl px-3 py-1.5 text-center shrink-0", left <= 3 ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600" : "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300")}>
          <p className="text-xl font-extrabold tabular-nums leading-none">{Math.max(0, left)}</p>
          <p className="text-[10px]">{left === 1 ? "day left" : left <= 0 ? "exam day" : "days left"}</p>
        </div>
      </div>
      <div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-teal-500 transition-all" style={{ width: `${prog.percent}%` }} /></div>
        <p className="text-xs text-slate-500 mt-1">{prog.doneItems} of {prog.totalItems} sessions done · {prog.percent}%</p>
      </div>
      <div className="flex gap-2">
        {prog.missedItems > 0 && left > 0 && (
          <Button size="sm" variant="amber" onClick={() => void reschedule()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reschedule {prog.missedItems} missed</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}{open ? "Hide" : "Show"} plan</Button>
        <Button size="sm" variant="ghost" className="ml-auto text-slate-400 hover:text-rose-600" aria-label="Delete plan" onClick={() => void remove()}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {open && (
        <div className="space-y-3">
          {exam.plan.length === 0 && <p className="text-sm text-slate-500">No study days left before this exam.</p>}
          {visible.map((d) => (
            <div key={d.date} className="space-y-1.5">
              <p className={cn("text-xs font-bold uppercase tracking-wide", d.date === today ? "text-teal-600" : d.date < today ? "text-rose-500" : "text-slate-400")}>
                {d.date === today ? "Today" : niceDate(d.date)}{d.date < today ? " · missed" : ""}
              </p>
              {d.items.map((it) => {
                const done = !!exam.done[it.id];
                return (
                  <button key={it.id} type="button" onClick={() => void toggle(it.id, !done)} className={cn("w-full min-h-[44px] flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm", done ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800" : "border-slate-200 dark:border-slate-700")}>
                    <span className={cn("h-5 w-5 shrink-0 rounded-md border grid place-items-center", done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600")}>{done && <Check className="h-3.5 w-3.5" />}</span>
                    <span className={cn("flex-1 min-w-0 break-words", done && "line-through text-slate-400")}>{it.kind === "learn" ? "Learn" : "Review"}: {it.topic}</span>
                    <span className="text-xs text-slate-400 shrink-0">{it.minutes} min</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
