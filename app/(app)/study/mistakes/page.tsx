"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, BookX, Check, Eye, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg, send } from "@/lib/study/client";
import { cn } from "@/lib/utils";

interface Mistake {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  studentAnswer: string;
  explanation: string;
  classId: string | null;
  classTitle: string;
  kcId?: string | null;
  topic: string;
  wrongCount: number;
  retestCorrect: number;
  mastered: boolean;
  source: string;
}
interface Listing {
  items: Mistake[];
  counts: { open: number; mastered: number };
  classes: Array<{ id: string; title: string }>;
  topics: string[];
}
interface RetestQ { id: string; question: string; options: string[]; topic: string; classTitle: string; correctIndex?: number; explanation?: string; fresh?: boolean }

/** Where a student goes to learn the topic again before being tested on it. */
function relearnHref(m: { classId?: string | null; kcId?: string | null; topic?: string }): string {
  if (m.classId && m.kcId) return `/classes/${m.classId}/topics/${m.kcId}`;
  if (m.classId) return `/classes/${m.classId}`;
  return `/tutor`;
}

export default function MistakesPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<"open" | "mastered">("open");
  const [classId, setClassId] = useState("");
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<Listing | null>(null);
  const [retest, setRetest] = useState<RetestQ[] | null>(null);
  const [refresh, setRefresh] = useState(false);
  const [peek, setPeek] = useState<Set<string>>(new Set());

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ status });
    if (classId) qs.set("classId", classId);
    if (topic) qs.set("topic", topic);
    api<Listing>(`/api/study/mistakes?${qs}`)
      .then((d) => alive && setData({ ...d, items: asArray<Mistake>(d.items), classes: asArray(d.classes), topics: asArray<string>(d.topics) }))
      .catch((e) => {
        if (!alive) return;
        setData({ items: [], counts: { open: 0, mastered: 0 }, classes: [], topics: [] });
        toast({ title: "Couldn't load mistakes", description: errMsg(e), variant: "destructive" });
      });
    return () => {
      alive = false;
    };
  }, [status, classId, topic, tick, toast]);

  const startRetest = async () => {
    try {
      const qs = new URLSearchParams({ retest: "1" });
      if (classId) qs.set("classId", classId);
      if (topic) qs.set("topic", topic);
      const d = await api<{ items: RetestQ[] }>(`/api/study/mistakes?${qs}`);
      const items = asArray<RetestQ>(d.items);
      if (items.length === 0) toast({ title: "Nothing to retest", description: "No open mistakes match your filters." });
      else {
        setRetest(items);
        setRefresh(true);
      }
    } catch (e) {
      toast({ title: "Couldn't start retest", description: errMsg(e), variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/study/mistakes/${id}`, { method: "DELETE" });
      setData((d) => d && { ...d, items: d.items.filter((m) => m.id !== id) });
    } catch (e) {
      toast({ title: "Couldn't delete", description: errMsg(e), variant: "destructive" });
    }
  };

  if (retest && refresh) {
    // Relearn first: the topics are offered again, then the test uses new questions on them.
    const seen = new Set<string>();
    const topics = (data?.items || []).filter((m) => !m.mastered && (!classId || m.classId === classId) && (!topic || m.topic.toLowerCase() === topic.toLowerCase())).filter((m) => {
      const k = `${m.classId}|${m.kcId}|${m.topic}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <Card className="p-5 space-y-3">
          <h2 className="text-xl font-extrabold">Look at the topic first</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">The test uses new questions on the same ideas, so re-reading helps more than remembering an answer. Open a topic, then come back.</p>
          <div className="space-y-2">
            {topics.slice(0, 6).map((m) => (
              <Link key={m.id} href={relearnHref(m)} className="flex min-h-[48px] items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted/60">
                <BookOpen className="h-4 w-4 text-brand-600" aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate">{m.topic || "Open the lesson"}{m.classTitle ? ` · ${m.classTitle}` : ""}</span>
              </Link>
            ))}
          </div>
          <Button className="w-full" size="lg" onClick={() => setRefresh(false)}>I&apos;m ready, test me</Button>
          <button type="button" onClick={() => { setRetest(null); setRefresh(false); }} className="w-full text-xs font-semibold text-slate-500 h-9">Not now</button>
        </Card>
      </div>
    );
  }
  if (retest) {
    return <Retest items={retest} onExit={() => { setRetest(null); load(); }} />;
  }

  const select = "h-10 flex-1 min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm";
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2"><BookX className="h-7 w-7 text-rose-500" /> Mistake notebook</h1>
        <p className="text-sm text-slate-500">Every wrong answer from quizzes and your daily challenge, with the fix. Get a question right twice in a retest to master it.</p>
      </div>

      <div className="flex gap-1.5">
        {(["open", "mastered"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={cn("rounded-full px-4 py-2 text-xs font-semibold border capitalize", status === s ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 dark:border-slate-700")}>
            {s} {data ? `(${data.counts[s]})` : ""}
          </button>
        ))}
      </div>

      {data && (data.classes.length > 0 || data.topics.length > 0) && (
        <div className="flex gap-2">
          <select className={select} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class">
            <option value="">All classes</option>
            {asArray(data.classes).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <select className={select} value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Filter by topic">
            <option value="">All topics</option>
            {data.topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {status === "open" && data && data.counts.open > 0 && (
        <Button className="w-full" size="lg" onClick={() => void startRetest()}><RotateCcw className="h-4 w-4 mr-2" /> Retest me</Button>
      )}

      {!data && <Skeleton className="h-40 w-full" />}
      {data && data.items.length === 0 && (
        <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4">
          {status === "open" ? "No open mistakes. Nice! Wrong answers from quizzes will show up here." : "Nothing mastered yet."}
        </p>
      )}
      {(data?.items || []).map((m) => (
        <Card key={m.id} className="p-4 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap gap-1.5">
                {m.topic && <Badge variant="secondary">{m.topic}</Badge>}
                {m.classTitle && <Badge variant="outline">{m.classTitle}</Badge>}
                {m.wrongCount > 1 && <Badge variant="destructive">missed {m.wrongCount}x</Badge>}
                {m.mastered ? <Badge variant="emerald">mastered</Badge> : m.retestCorrect > 0 && <Badge variant="amber">1 / 2 retests</Badge>}
              </div>
              <p className="font-semibold break-words">{m.question}</p>
            </div>
            <button type="button" aria-label="Delete" onClick={() => void remove(m.id)} className="h-9 w-9 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button>
          </div>
          <p className="text-sm flex gap-1.5"><X className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" /><span className="break-words">You said: {m.studentAnswer}</span></p>
          {m.mastered || peek.has(m.id) ? (
            <>
              <p className="text-sm flex gap-1.5"><Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /><span className="break-words">Correct: {m.correctAnswer}</span></p>
              {m.explanation && <p className="text-sm text-slate-600 dark:text-slate-300 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">{m.explanation}</p>}
            </>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={relearnHref(m)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">
                <BookOpen className="h-4 w-4" aria-hidden="true" /> Relearn this topic
              </Link>
              <button type="button" onClick={() => setPeek((p) => new Set(p).add(m.id))} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-slate-600 hover:bg-muted/60 dark:text-slate-300">
                <Eye className="h-4 w-4" aria-hidden="true" /> Show the answer
              </button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Retest({ items, onExit }: { items: RetestQ[]; onExit: () => void }) {
  const { toast } = useToast();
  const [pos, setPos] = useState(0);
  const [result, setResult] = useState<{ selected: number; correct: boolean; correctIndex: number; explanation: string; mastered: boolean } | null>(null);
  const [score, setScore] = useState({ right: 0, mastered: 0 });
  const [busy, setBusy] = useState(false);

  const answer = (i: number) => {
    if (result) return;
    const q = items[pos];
    const instant = typeof q.correctIndex === "number";
    const id = q.id;
    // checked on the phone so the result is instant; the notebook is updated behind it
    if (instant) {
      const correct = i === q.correctIndex;
      setResult({ selected: i, correct, correctIndex: q.correctIndex as number, explanation: q.explanation || "", mastered: false });
      setScore((s) => ({ ...s, right: s.right + (correct ? 1 : 0) }));
    } else {
      setBusy(true);
    }
    const save = async (attempt: number): Promise<void> => {
      try {
        const r = await send<{ correct: boolean; correctIndex: number; explanation: string; mastered: boolean }>(`/api/study/mistakes/${id}`, { selectedIndex: i });
        if (!instant) {
          setResult({ selected: i, ...r });
          setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), mastered: s.mastered + (r.mastered ? 1 : 0) }));
        } else if (r.mastered) {
          setResult((cur) => (cur && cur.selected === i ? { ...cur, mastered: true } : cur));
          setScore((s) => ({ ...s, mastered: s.mastered + 1 }));
        }
      } catch (e) {
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
          return save(attempt + 1);
        }
        toast({ title: "Couldn't save that answer", description: errMsg(e), variant: "destructive" });
      } finally {
        if (!instant) setBusy(false);
      }
    };
    void save(0);
  };

  if (pos >= items.length) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="p-6 text-center space-y-3">
          <p className="text-4xl">{score.right === items.length ? "🏆" : "💪"}</p>
          <p className="text-xl font-extrabold">Retest done</p>
          <p className="text-sm text-slate-500">{score.right} of {items.length} right · {score.mastered} newly mastered</p>
          <Button onClick={onExit}>Back to notebook</Button>
        </Card>
      </div>
    );
  }
  const q = items[pos];
  return (
    <div className="max-w-xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase text-slate-400">Retest {pos + 1} / {items.length}{q.topic ? ` · ${q.topic}` : ""}</p>
        <button type="button" onClick={onExit} className="text-xs font-semibold text-slate-500 h-9 px-2">Stop</button>
      </div>
      <Card className="p-4 space-y-3">
        <p className="font-semibold break-words">{q.question}</p>
        {q.options.map((o, i) => {
          const right = result && i === result.correctIndex;
          const wrong = result && i === result.selected && !result.correct;
          return (
            <button key={i} type="button" disabled={!!result || busy} onClick={() => answer(i)} className={cn("w-full min-h-[48px] text-left rounded-xl border px-3 py-2.5 text-sm", !result && "border-slate-300 dark:border-slate-700 hover:border-brand-500", right && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30", wrong && "border-rose-500 bg-rose-50 dark:bg-rose-950/30", result && !right && !wrong && "opacity-60")}>
              {o}
            </button>
          );
        })}
        {result && (
          <>
            {result.mastered && <p className="text-sm font-semibold text-emerald-600">Mastered! You will not see this one again.</p>}
            {result.explanation && <p className="text-sm text-slate-600 dark:text-slate-300 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">{result.explanation}</p>}
            <Button className="w-full" onClick={() => { setResult(null); setPos((p) => p + 1); }}>{pos + 1 >= items.length ? "Finish" : "Next"}</Button>
          </>
        )}
      </Card>
    </div>
  );
}
