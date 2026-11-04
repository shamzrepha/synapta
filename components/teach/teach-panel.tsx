"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api/client";
import { TeachPlayer } from "./teach-player";
import type { LessonScript } from "@/lib/teach/script";

export type TeachSource = { type: "kc"; classId: string; kcId: string } | { type: "note"; id: string };

/** Fetches (and the first time, writes) the interactive lesson for a topic or notes, then plays it. */
export function TeachPanel({ source, canRegenerate = false }: { source: TeachSource; canRegenerate?: boolean }) {
  const [script, setScript] = useState<LessonScript | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const key = JSON.stringify(source);

  const load = useCallback(
    async (regenerate = false) => {
      setBusy(true);
      setError("");
      const j = await fetchJson<{ script: LessonScript }>("/api/teach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: JSON.parse(key), regenerate }) });
      if (j.ok) setScript(j.data.script);
      else setError(j.error.message);
      setBusy(false);
    },
    [key]
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (busy && !script)
    return (
      <Card className="p-8 text-center space-y-2">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600 mx-auto" />
        <p className="font-semibold text-sm">Building your interactive lesson…</p>
        <p className="text-xs text-slate-500">The first time takes up to a minute. After that it opens straight away.</p>
      </Card>
    );
  if (error && !script)
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-sm">{error}</p>
        <Button size="sm" onClick={() => load()}>Try again</Button>
      </Card>
    );
  return (
    <div className="space-y-2">
      {script && <TeachPlayer script={script} />}
      {canRegenerate && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => load(true)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />} Write it again
          </Button>
        </div>
      )}
    </div>
  );
}
