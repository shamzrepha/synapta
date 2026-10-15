"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Route, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const AREAS = ["AI & Machine Learning", "Robotics", "Mechatronics", "Electronics", "Embedded systems & IoT", "Mechanical", "Electrical & Power", "Software & Programming", "Civil & Structural"];
const EXAMPLES = ["Build a line-following robot", "Automatic plant watering system", "A gearbox that lifts 10 kg by hand", "A classroom air quality monitor"];

interface PathSummary {
  id: string;
  goal: string;
  title: string;
  stages: number;
  done: number;
  total: number;
}

async function fetchPaths(): Promise<PathSummary[]> {
  try {
    const j = await fetch("/api/studio/paths").then((r) => r.json());
    return j.ok ? asArray<PathSummary>(j.data.paths) : [];
  } catch {
    return [];
  }
}

/** "Type a goal, get a step-by-step path of what to learn and build next." */
export default function PathsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState(1);
  const [areas, setAreas] = useState<string[]>([]);
  const [preference, setPreference] = useState("One consistent source from start to finish");
  const [busy, setBusy] = useState(false);
  const [paths, setPaths] = useState<PathSummary[] | null>(null);

  useEffect(() => {
    fetchPaths().then(setPaths);
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/studio/paths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, level, interests: areas, preference }) }).then((r) => r.json());
      if (j.ok) router.push(`/studio/path/${j.data.id}`);
      else toast({ title: "Couldn't make the path", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/studio" className="inline-flex items-center gap-1 text-xs text-slate-500"><ArrowLeft className="h-3.5 w-3.5" /> Maker Studio</Link>
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Route className="h-6 w-6 text-teal-600" /> Goal → learning path</h1>
        <p className="text-sm text-slate-500">Type what you want to build. You&apos;ll get an ordered path: what to learn first, videos for each step, a build checklist after every lesson, and a simulator project to practise it — before you buy a single part.</p>
      </div>
      <Card className="p-4 space-y-4">
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} maxLength={500} placeholder="e.g. build a line-following robot" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setGoal(e)} className="rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs hover:border-teal-500">{e}</button>
          ))}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold">Your level</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Beginner</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setLevel(n)} className={cn("h-8 w-8 rounded-full border font-bold", level === n ? "bg-teal-600 text-white border-teal-600" : "border-slate-300 dark:border-slate-700")}>{n}</button>
            ))}
            <span className="text-slate-500">Advanced</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold">Areas you&apos;re into (up to 2)</p>
          <div className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => {
              const on = areas.includes(a);
              return (
                <button key={a} type="button" onClick={() => setAreas((x) => (on ? x.filter((y) => y !== a) : x.length < 2 ? [...x, a] : x))} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 dark:border-slate-700")}>{a}</button>
              );
            })}
          </div>
        </div>
        <label className="block text-xs font-semibold space-y-1">
          When learning a topic you prefer
          <select value={preference} onChange={(e) => setPreference(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm font-normal">
            <option>One consistent source from start to finish</option>
            <option>A mix of different creators, as long as it&apos;s well ordered</option>
            <option>No preference</option>
          </select>
        </label>
        <Button className="w-full" onClick={create} isLoading={busy} disabled={goal.trim().length < 4}>
          <Sparkles className="h-4 w-4 mr-1" /> Make my path
        </Button>
        {busy && <p className="text-xs text-center text-slate-500">Planning your path… about 20 seconds.</p>}
      </Card>

      <section className="space-y-2">
        <h2 className="font-bold">My paths</h2>
        {paths === null ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : paths.length === 0 ? (
          <p className="text-sm text-slate-500">No paths yet.</p>
        ) : (
          paths.map((p) => (
            <Link key={p.id} href={`/studio/path/${p.id}`}>
              <Card className="p-3 hover:border-teal-500/60 mb-2">
                <p className="font-semibold">{p.title}</p>
                <p className="text-xs text-slate-500">{p.goal}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-teal-500" style={{ width: `${(p.done / Math.max(1, p.total)) * 100}%` }} />
                </div>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
