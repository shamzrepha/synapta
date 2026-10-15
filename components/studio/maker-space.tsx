"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wrench, Plus, GitCommit } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";

const STARTERS = [
  { id: "traffic-light", label: "Traffic light" },
  { id: "gear-lift", label: "Gear reduction winch" },
  { id: "blink", label: "Blink an LED" },
  { id: "night-light", label: "Night light" },
  { id: "classair", label: "ClassAir (3D)" },
];

interface Summary {
  title: string;
  commitCount: number;
  contributors: Array<{ uid: string; name: string; commits: number }>;
}

async function fetchSummary(id: string): Promise<Summary | null> {
  try {
    const j = await fetch(`/api/studio/designs/${id}`).then((r) => r.json());
    return j.ok ? { title: j.data.design.title, commitCount: j.data.design.commitCount, contributors: asArray(j.data.design.contributors) } : null;
  } catch {
    return null;
  }
}

/**
 * Lounge "maker space": one design the whole room builds together. Everyone in the room can edit it;
 * each save is credited to its author in the design's History, with live refresh for everyone.
 */
export function MakerSpace({ roomCode, designId }: { roomCode: string; designId: string | null | undefined }) {
  const router = useRouter();
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState<Array<{ id: string; title: string }>>([]);
  const [pick, setPick] = useState(false);

  const refresh = useCallback(() => {
    if (designId) fetchSummary(designId).then(setSummary);
  }, [designId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useLiveChannel(designId ? `design:${designId}` : null, refresh);

  const start = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const j = await fetch(`/api/lounge/rooms/${roomCode}/design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.ok) router.push(`/studio/${j.data.designId}`);
      else toast({ title: "Couldn't start the shared design", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const loadMine = () => {
    setPick((v) => !v);
    fetch("/api/studio/designs?scope=mine")
      .then((r) => r.json())
      .then((j) => setMine(j.ok ? asArray<{ id: string; title: string }>(j.data.designs) : []))
      .catch(() => null);
  };

  return (
    <Card className="p-4 space-y-3 border-teal-500/30 bg-teal-50/30 dark:bg-teal-950/20">
      <p className="font-bold text-sm flex items-center gap-2">
        <Wrench className="h-4 w-4 text-teal-600" /> Maker space
      </p>
      {designId ? (
        <>
          <p className="text-xs text-slate-600 dark:text-slate-400">Everyone in this room can edit the shared design. Each change is saved as a version with the author&apos;s name.</p>
          {summary && (
            <div className="space-y-1">
              <p className="text-sm font-semibold">{summary.title}</p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <GitCommit className="h-3 w-3" /> {summary.commitCount} version{summary.commitCount === 1 ? "" : "s"}
                {summary.contributors.length > 0 && ` · ${summary.contributors.map((c) => `${c.name} ${c.commits}`).join(", ")}`}
              </p>
            </div>
          )}
          <Link href={`/studio/${designId}`}>
            <Button size="sm" className="w-full">
              <Wrench className="h-4 w-4 mr-1" /> Open shared design
            </Button>
          </Link>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-600 dark:text-slate-400">Build something together: wire, code and test one design with the whole room, like a shared Git project.</p>
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((t) => (
              <Button key={t.id} size="sm" variant="outline" isLoading={busy === t.id} onClick={() => start({ from: "template", templateId: t.id }, t.id)}>
                {t.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={loadMine}>
              <Plus className="h-4 w-4 mr-1" /> Use one of mine
            </Button>
          </div>
          {pick && (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {mine.length === 0 && <li className="text-xs text-slate-500">You have no designs yet.</li>}
              {mine.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => start({ from: "mine", designId: d.id }, d.id)} className="w-full text-left text-sm rounded-lg px-2 py-1.5 hover:bg-white dark:hover:bg-slate-900">
                    {d.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
