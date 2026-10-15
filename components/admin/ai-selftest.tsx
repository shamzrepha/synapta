"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/api/client";

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

/** Runs the live AI self-test (text, JSON, heavy builds, both voice engines). */
export function AiSelfTest() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const j = await fetch("/api/admin/system/ai-selftest", { method: "POST" }).then((r) => r.json());
      if (j.ok) setChecks(asArray<Check>(j.data.checks));
      else setError(j.error?.message || "Self-test failed to run");
    } catch {
      setError("Self-test failed to run");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Activity className="h-5 w-5 text-teal-600" />
        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-base">AI self-test</h3>
          <p className="text-xs text-slate-500">Calls every AI path live: tutor, quizzes/flashcards JSON, class builds and both voice engines.</p>
        </div>
        <Button size="sm" onClick={run} isLoading={running}>
          Run self-test
        </Button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {checks && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {checks.map((c) => (
            <li key={c.name} className="flex items-start gap-2 py-2 text-sm">
              {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.name} <span className="text-xs font-normal text-slate-400">· {(c.ms / 1000).toFixed(1)}s</span>
                </p>
                <p className="text-xs text-slate-500 break-words">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
