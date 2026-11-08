"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Database, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Action = "prepare" | "regenerate_quiz" | "extend_quiz" | "regenerate_cards";

interface ReviewQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  focus?: string;
}
interface ReviewCard {
  id: string;
  front: string;
  back: string;
}

/** Teacher view of a topic's stored practice banks (questions + flashcards) with refresh controls. */
export function PracticeBankTools({ classId, kcId }: { classId: string; kcId: string }) {
  const { toast } = useToast();
  const base = `/api/classes/${classId}/kcs/${kcId}/practice`;
  const [sizes, setSizes] = useState<{ questions: number; cards: number } | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [review, setReview] = useState<{ questions: ReviewQuestion[]; cards: ReviewCard[] } | null>(null);
  const [open, setOpen] = useState<"questions" | "cards" | null>(null);

  const loadReview = useCallback(async () => {
    const j = await fetch(`${base}?full=1`).then((r) => r.json()).catch(() => null);
    if (j?.ok) setReview(j.data);
  }, [base]);

  const toggle = (which: "questions" | "cards") => {
    const next = open === which ? null : which;
    setOpen(next);
    if (next && !review) loadReview();
  };

  const remove = async (kind: "question" | "card", id: string) => {
    setReview((r) => (r ? { questions: kind === "question" ? r.questions.filter((q) => q.id !== id) : r.questions, cards: kind === "card" ? r.cards.filter((c) => c.id !== id) : r.cards } : r));
    const j = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", kind, id }) }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setSizes(j.data);
    else {
      toast({ title: "Couldn't remove it", variant: "destructive" });
      loadReview();
    }
  };

  useEffect(() => {
    fetch(base)
      .then((r) => r.json())
      .then((j) => j.ok && setSizes(j.data))
      .catch(() => null);
  }, [base]);

  const run = async (action: Action) => {
    setBusy(action);
    try {
      const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (data.ok) {
        setSizes(data.data);
        if (review) loadReview();
        toast({ title: "Practice bank updated", description: `${data.data.questions} questions · ${data.data.cards} flashcards`, variant: "success" });
      } else {
        toast({ title: "Couldn't update the bank", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  };

  const empty = sizes && sizes.questions === 0 && sizes.cards === 0;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Database className="h-4 w-4 text-brand-600" /> Practice bank
        <span className="font-normal text-xs text-slate-500">
          {sizes ? `${sizes.questions} questions · ${sizes.cards} flashcards` : "…"}
        </span>
      </p>
      <p className="text-xs text-slate-500">
        Prepared automatically once the lesson is written (about 60 questions and 40 flashcards) and shared by every student for self-testing. Review them below and remove any you don&apos;t want; publish to lock the approved set. Graded work goes in assignments.
      </p>
      <div className="flex flex-wrap gap-2">
        {empty ? (
          <Button size="sm" onClick={() => run("prepare")} isLoading={busy === "prepare"}>
            Prepare now (~60 questions + 40 cards)
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => run("extend_quiz")} isLoading={busy === "extend_quiz"}>
              Add ~60 more questions
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("regenerate_quiz")} isLoading={busy === "regenerate_quiz"}>
              Regenerate questions
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("regenerate_cards")} isLoading={busy === "regenerate_cards"}>
              Regenerate flashcards
            </Button>
          </>
        )}
      </div>
      {sizes && !empty && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => toggle("questions")}>
            {open === "questions" ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />} Review all {sizes.questions} questions
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggle("cards")}>
            {open === "cards" ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />} Review all {sizes.cards} flashcards
          </Button>
        </div>
      )}
      {open === "questions" && (
        <ol className="max-h-[480px] space-y-2 overflow-y-auto pr-1 text-sm">
          {!review && <li className="text-xs text-slate-500">Loading…</li>}
          {review?.questions.map((q, i) => (
            <li key={q.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-slate-400">{i + 1}.</span>
                <p className="flex-1 font-medium">{q.question}</p>
                <button type="button" onClick={() => remove("question", q.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove this question" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-1.5 grid gap-1 pl-5 text-xs">
                {q.options.map((o, k) => (
                  <li key={k} className={k === q.correctIndex ? "font-semibold text-brand-700 dark:text-brand-300" : "text-slate-600 dark:text-slate-400"}>
                    {String.fromCharCode(65 + k)}. {o} {k === q.correctIndex && "✓"}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="mt-1.5 pl-5 text-xs text-slate-500">{q.explanation}</p>}
            </li>
          ))}
        </ol>
      )}
      {open === "cards" && (
        <ul className="max-h-[480px] space-y-2 overflow-y-auto pr-1 text-sm">
          {!review && <li className="text-xs text-slate-500">Loading…</li>}
          {review?.cards.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex-1">
                <p className="font-medium">{c.front}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{c.back}</p>
              </div>
              <button type="button" onClick={() => remove("card", c.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove this flashcard" title="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
