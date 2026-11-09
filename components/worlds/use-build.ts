"use client";

import { useCallback, useRef, useState } from "react";

export interface BuildProgress {
  status: "idle" | "running" | "done" | "error";
  stageLabel: string;
  done: number;
  total: number;
  skipped: number;
  error: string | null;
}

const STEPS = ["Reading your notes", "Finding the key facts", "Merging with your library", "Your world is ready"];

/** Runs a build job by calling /api/worlds/advance until it is finished. Safe to start again after a refresh: the server remembers the work. */
export function useBuild(onDone?: () => void) {
  const [p, setP] = useState<BuildProgress>({ status: "idle", stageLabel: STEPS[0], done: 0, total: 0, skipped: 0, error: null });
  const running = useRef(false);

  const run = useCallback(
    async (jobId: string) => {
      if (running.current) return;
      running.current = true;
      setP((x) => ({ ...x, status: "running", error: null }));
      let failures = 0;
      try {
        for (let i = 0; i < 400; i++) {
          let j: { ok: boolean; data?: { more: boolean; status: string; stageLabel?: string; done: number; total: number; skipped: number; error: string | null }; error?: { message?: string } };
          try {
            const res = await fetch("/api/worlds/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
            j = await res.json();
          } catch {
            failures++;
            if (failures > 5) throw new Error("Lost the connection. Your progress is saved: reopen this page to continue.");
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          if (!j.ok || !j.data) throw new Error(j.error?.message || "Something went wrong.");
          failures = 0;
          const d = j.data;
          setP({ status: "running", stageLabel: d.stageLabel || STEPS[1], done: d.done, total: d.total, skipped: d.skipped, error: d.error });
          if (d.error && /isn't assigned|assign a model|No AI model/i.test(d.error)) throw new Error(d.error);
          if (!d.more || d.status === "done") {
            setP((x) => ({ ...x, status: "done", stageLabel: STEPS[3] }));
            onDone?.();
            return;
          }
          // a call that found the job busy returns quickly: wait a moment before asking again
          await new Promise((r) => setTimeout(r, d.status === "running" ? 200 : 800));
        }
        throw new Error("This is taking longer than expected. Your progress is saved: reopen this page to continue.");
      } catch (e) {
        setP((x) => ({ ...x, status: "error", error: (e as Error).message }));
      } finally {
        running.current = false;
      }
    },
    [onDone]
  );

  return { progress: p, run };
}
