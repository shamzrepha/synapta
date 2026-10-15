"use client";

import React, { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Action = "prepare" | "regenerate_quiz" | "extend_quiz" | "regenerate_cards";

/** Teacher view of a topic's stored practice banks (questions + flashcards) with refresh controls. */
export function PracticeBankTools({ classId, kcId }: { classId: string; kcId: string }) {
  const { toast } = useToast();
  const base = `/api/classes/${classId}/kcs/${kcId}/practice`;
  const [sizes, setSizes] = useState<{ questions: number; cards: number } | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

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
        <Database className="h-4 w-4 text-teal-600" /> Practice bank
        <span className="font-normal text-xs text-slate-500">
          {sizes ? `${sizes.questions} questions · ${sizes.cards} flashcards` : "…"}
        </span>
      </p>
      <p className="text-xs text-slate-500">
        Generated once and shared by every student, so quizzes and flashcards don&apos;t use AI per student. Refresh after rewriting the lesson.
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
    </div>
  );
}
