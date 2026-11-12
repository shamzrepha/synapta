"use client";

import React, { useRef, useState } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WriterKc {
  id: string;
  title: string;
  lessonStyle?: string;
}

/**
 * For teachers: rewrites the class's short notes as full textbook chapters, one topic at a time (each chapter takes the AI
 * a minute or so), following the topic tree so a parent topic introduces its sub-topics and each sub-topic goes deep.
 */
export function TextbookWriter({ classId, kcs, onChanged }: { classId: string; kcs: WriterKc[]; onChanged: () => void }) {
  const pending = kcs.filter((k) => k.lessonStyle !== "textbook-v1");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState("");
  const [failed, setFailed] = useState<string[]>([]);
  const stop = useRef(false);

  if (pending.length === 0 && !running && failed.length === 0) return null;

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setDone(0);
    setFailed([]);
    const queue = [...pending];
    const bad: string[] = [];
    for (let i = 0; i < queue.length && !stop.current; i++) {
      const k = queue[i];
      setCurrent(k.title);
      try {
        const res = await fetch(`/api/classes/${classId}/kcs/${k.id}/lesson`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerate: true }) });
        const j = await res.json().catch(() => null);
        // "being written right now" means another tab is already on it: not a failure
        if (!j?.ok && j?.error?.code !== "LESSON_GENERATING") bad.push(k.title);
      } catch {
        bad.push(k.title);
      }
      setDone(i + 1);
    }
    setFailed(bad);
    setRunning(false);
    setCurrent("");
    onChanged();
  };

  return (
    <div className="mb-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2" role="region" aria-label="Textbook writer">
      <p className="flex items-center gap-2 text-sm font-bold">
        <BookMarked className="h-4 w-4 text-amber-600 shrink-0" />
        {pending.length > 0 ? `${pending.length} ${pending.length === 1 ? "topic is" : "topics are"} still short notes` : "Some chapters could not be written"}
      </p>
      <p className="hidden sm:block text-xs text-muted-foreground">
        The AI can rewrite them as full textbook chapters: numbered sections and sub-sections, worked examples, a summary, key terms and review questions, following your topic tree (for example Actuators, then Motors, then Brushless and Coreless motors).
      </p>
      {running ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold flex items-center gap-2" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing chapter {Math.min(done + 1, pending.length)} of {pending.length}: {current}
          </p>
          <div className="h-1.5 rounded-full bg-amber-500/20 overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${(done / Math.max(1, pending.length)) * 100}%` }} />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => (stop.current = true)}>Stop after this chapter</Button>
        </div>
      ) : (
        <>
          {failed.length > 0 && <p className="text-xs text-rose-600">Could not write: {failed.slice(0, 4).join(", ")}{failed.length > 4 ? "…" : ""}. You can try again.</p>}
          <Button type="button" size="sm" onClick={run}>{failed.length > 0 ? "Try again" : "Write full textbook chapters"}</Button>
        </>
      )}
    </div>
  );
}
