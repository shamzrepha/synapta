"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg } from "@/lib/teach/client";

interface TakeSet {
  id: string;
  title: string;
  status: string;
  released: boolean;
  submitted: boolean;
  questions: { id: string; prompt: string; maxMarks: number }[];
  result: null | {
    total: number;
    max: number;
    percent: number;
    perQuestion: { questionId: string; total: number; max: number; feedback: string; explanation: string; answer: string }[];
  };
}

export default function TakeGradingSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [set, setSet] = useState<TakeSet | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<TakeSet>(`/api/grading/${id}`)
      .then((d) => alive && setSet({ ...d, questions: asArray(d.questions) }))
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  async function submit() {
    if (!window.confirm("Submit your answers? You cannot change them afterwards.")) return;
    setBusy(true);
    try {
      await api(`/api/grading/${id}/submit`, { method: "POST", body: { answers } });
      setSet((s) => (s ? { ...s, submitted: true } : s));
      toast({ title: "Submitted", description: "Your marks will show once your teacher releases them.", variant: "success" });
    } catch (e) {
      toast({ title: "Could not submit", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:px-6">
      <Link href="/teach/grading" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-teal-600 dark:text-slate-400"><ArrowLeft className="h-4 w-4" /> All sets</Link>
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : !set ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : (
        <>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{set.title}</h1>
          {set.submitted && set.released && set.result ? (
            <>
              <Card><CardContent className="p-5 text-center">
                <p className="text-3xl font-extrabold text-teal-600 dark:text-teal-400">{set.result.total} / {set.result.max}</p>
                <p className="text-sm text-slate-500">{set.result.percent}%</p>
              </CardContent></Card>
              {set.questions.map((q, i) => {
                const r = set.result!.perQuestion.find((p) => p.questionId === q.id);
                return (
                  <Card key={q.id}><CardContent className="space-y-2 p-4 text-sm">
                    <p className="font-semibold text-slate-900 dark:text-white">{i + 1}. {q.prompt}</p>
                    <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">{r?.answer || <em>No answer</em>}</p>
                    <p className="font-semibold">{r?.total ?? 0} / {q.maxMarks} marks</p>
                    {r?.feedback && <p className="text-slate-700 dark:text-slate-300"><strong>Teacher:</strong> {r.feedback}</p>}
                    {r?.explanation && <p className="text-xs text-slate-500">{r.explanation}</p>}
                  </CardContent></Card>
                );
              })}
            </>
          ) : set.submitted ? (
            <Card><CardContent className="flex items-center gap-3 p-5 text-sm text-slate-700 dark:text-slate-300">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" /> Submitted. Your marks will appear here once your teacher releases them.
            </CardContent></Card>
          ) : set.status !== "open" ? (
            <p className="text-sm text-slate-500">This set is closed.</p>
          ) : (
            <>
              {set.questions.map((q, i) => (
                <Card key={q.id}><CardContent className="space-y-2 p-4">
                  <p className="font-semibold text-slate-900 dark:text-white">{i + 1}. {q.prompt} <span className="text-xs font-normal text-slate-500">({q.maxMarks} marks)</span></p>
                  <Textarea rows={4} maxLength={4000} placeholder="Your answer" value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                </CardContent></Card>
              ))}
              <Button className="w-full" size="lg" onClick={submit} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {busy ? "Marking…" : "Submit answers"}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
