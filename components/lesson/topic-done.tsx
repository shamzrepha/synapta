"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Layers, Layers3, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractRecallItems } from "@/lib/study/recall";

/**
 * Shown at the end of a topic's note. It marks the topic as read, offers the ways to lock it in (quiz, flashcards, teach-me),
 * leads on to the next chapter and, when the whole class has been read, to the next phase of the learning journey.
 */
export function TopicDone({
  classId,
  kcId,
  title,
  nextTitle,
  onNext,
  onSeen,
  classDone,
  classTitle,
  hasPractice = true,
  markdown,
  onRecallPass,
}: {
  classId: string;
  kcId: string;
  title: string;
  nextTitle?: string | null;
  onNext?: () => void;
  /** called once when the learner reaches this card */
  onSeen: (kcId: string) => void;
  classDone: boolean;
  classTitle: string;
  hasPractice?: boolean;
  /** the chapter text: its summary and key terms become the "close the book" recall check */
  markdown?: string;
  /** the learner recalled most of it: counts as a passed quick check */
  onRecallPass?: (kcId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        onSeen(kcId);
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [kcId, onSeen]);

  const items = useMemo(() => extractRecallItems(markdown || "", 4), [markdown]);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [got, setGot] = useState<boolean[]>([]);
  const finished = items.length > 0 && got.length >= items.length;
  const right = got.filter(Boolean).length;
  const passed = finished && right / items.length >= 0.75;
  const answer = (ok: boolean) => {
    const next = [...got, ok];
    setGot(next);
    setShown(false);
    setI(i + 1);
    if (next.length >= items.length && next.filter(Boolean).length / items.length >= 0.75) onRecallPass?.(kcId);
  };

  const link = (tab: string) => `/classes/${classId}/topics/${kcId}?tab=${tab}`;
  return (
    <div ref={box} className="mt-8 space-y-3">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
        <p className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> You&apos;ve read this chapter: {title}
        </p>
        {items.length >= 2 && (
          <div className="rounded-xl border border-border bg-card p-3 space-y-2" role="group" aria-label="Recall check">
            {!finished ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Close the book: can you recall it? ({i + 1} of {items.length})</p>
                <p className="text-[15px] font-medium leading-relaxed">{items[i].prompt}</p>
                {!shown ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setShown(true)}>I&apos;ve tried: show the answer</Button>
                ) : (
                  <>
                    <p className="rounded-lg bg-brand-500/10 px-3 py-2 text-sm"><span className="font-semibold">{items[i].answer}</span></p>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => answer(true)}>I got it</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => answer(false)}>Not yet</Button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm">
                <span className="font-bold">{right} of {items.length} recalled.</span>{" "}
                {passed ? "Strong. Now test it with the quiz." : "Flashcards are the best next step: they bring back the ones you missed."}
              </p>
            )}
          </div>
        )}
        {hasPractice && (
          <>
            <p className="text-sm text-muted-foreground">Lock it in while it&apos;s fresh. Quick practice makes it stick.</p>
            <div className="flex flex-wrap gap-2">
              <Link href={link("quiz")} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                <ListChecks className="h-4 w-4" /> Take the quiz
              </Link>
              <Link href={link("flashcards")} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
                <Layers className="h-4 w-4" /> Flashcards
              </Link>
              <Link href={link("teach")} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
                <Sparkles className="h-4 w-4" /> Teach me
              </Link>
            </div>
          </>
        )}
        {nextTitle && onNext && (
          <Button type="button" variant="outline" onClick={onNext} className="w-full sm:w-auto">
            Next chapter: {nextTitle} <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        )}
      </div>

      {classDone && (
        <div className="rounded-2xl border border-brand-500/40 bg-brand-500/5 p-4 space-y-2">
          <p className="flex items-center gap-2 font-bold">
            <Layers3 className="h-5 w-5 text-brand-600 shrink-0" /> You&apos;ve read all of {classTitle}
          </p>
          <p className="text-sm text-muted-foreground">Next phase on your roadmap: practise and apply what you read. Your learning map shows what to do next, in order.</p>
          <Link href={`/classes/${classId}/map`} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Open my learning map <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
