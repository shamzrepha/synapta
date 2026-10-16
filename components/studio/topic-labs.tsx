"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Cog, Box, Plus, Sparkles, Trash2, Users, Wrench, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface LabRow {
  id: string;
  title: string;
  goal: string;
  kind: "circuit" | "mechanism" | "assembly";
  stepCount: number;
  dueAt: string | null;
  myDesignId: string | null;
  myDone: number;
  roster: Array<{ uid: string; name: string; designId: string; done: number }> | null;
}

interface Idea {
  title: string;
  pitch: string;
  kind: "circuit" | "mechanism" | "assembly";
  level: string;
  buildPrompt: string;
  parts: string[];
}

const ICON = { circuit: <Cpu className="h-4 w-4 text-emerald-600" />, mechanism: <Cog className="h-4 w-4 text-amber-600" />, assembly: <Box className="h-4 w-4 text-sky-600" /> };

const TEMPLATES = [
  { id: "blink", label: "Blink an LED" },
  { id: "traffic-light", label: "Traffic light" },
  { id: "button-led", label: "Button-controlled light" },
  { id: "night-light", label: "Automatic night light" },
  { id: "gear-lift", label: "Gear reduction winch" },
  { id: "hand-winch", label: "Hand-crank well winch" },
  { id: "classair", label: "ClassAir air filter (3D)" },
];

async function fetchLabs(classId: string, kcId: string) {
  try {
    const j = await fetch(`/api/classes/${classId}/kcs/${kcId}/labs`).then((r) => r.json());
    return j.ok ? { labs: asArray<LabRow>(j.data.labs), canManage: !!j.data.canManage } : null;
  } catch {
    return null;
  }
}

/**
 * A topic broken into hands-on build labs ("worlds"). Students start their own copy in Maker
 * Studio and work through its checked steps; teachers add labs and watch everyone's progress.
 */
export function TopicLabs({ classId, kcId, topicTitle }: { classId: string; kcId: string; topicTitle: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<{ labs: LabRow[]; canManage: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [source, setSource] = useState("template:traffic-light");
  const [myDesigns, setMyDesigns] = useState<Array<{ id: string; title: string }>>([]);
  const [focus, setFocus] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);

  const suggest = async () => {
    setIdeasBusy(true);
    try {
      const j = await fetch("/api/studio/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: topicTitle }) }).then((r) => r.json());
      if (j.ok) setIdeas(asArray<Idea>(j.data.ideas));
      else toast({ title: "Couldn't think of ideas just now", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't think of ideas just now", variant: "destructive" });
    } finally {
      setIdeasBusy(false);
    }
  };

  const refresh = useCallback(() => fetchLabs(classId, kcId).then((d) => d && setData(d)), [classId, kcId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!adding) return;
    fetch("/api/studio/designs?scope=mine")
      .then((r) => r.json())
      .then((j) => setMyDesigns(j.ok ? asArray<{ id: string; title: string }>(j.data.designs) : []))
      .catch(() => null);
  }, [adding]);

  const start = async (lab: LabRow) => {
    if (lab.myDesignId) return router.push(`/studio/${lab.myDesignId}`);
    setBusy(lab.id);
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${kcId}/labs/${lab.id}/start`, { method: "POST" }).then((r) => r.json());
      if (j.ok) router.push(`/studio/${j.data.designId}`);
      else toast({ title: "Couldn't start the lab", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${kcId}/labs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.ok) {
        setAdding(false);
        setTitle("");
        setGoal("");
        setFocus("");
        setDueDate("");
        refresh();
      } else toast({ title: "Couldn't update labs", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <Skeleton className="h-40 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold flex items-center gap-2"><Wrench className="h-5 w-5 text-teal-600" /> Build labs</p>
          <p className="text-xs text-slate-500">Learn {topicTitle} by building it: wire, code, simulate and test — no parts needed. This is the same Maker Studio you see under “Make”; your copy is saved in your designs.</p>
        </div>
        {data.canManage && (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Add lab
          </Button>
        )}
      </div>

      {adding && data.canManage && (
        <Card className="p-4 space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-bold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-violet-500" /> Let AI design a lab for this topic</p>
            <div className="flex gap-2">
              <input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={500} placeholder="Optional focus, e.g. “show why the resistor matters”" className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" />
              <Button onClick={() => post({ action: "generate", focus }, "gen")} isLoading={busy === "gen"} className="bg-violet-600 hover:bg-violet-700">Generate</Button>
            </div>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
            <p className="text-sm font-bold">…or add one yourself</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Lab title" className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" />
            <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} placeholder="Goal for students (optional)" className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" />
            <label className="flex items-center gap-2 text-xs font-semibold">
              Due date (makes it an assignment)
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm font-normal" />
            </label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm">
              <optgroup label="Guided starter projects">
                {TEMPLATES.map((t) => <option key={t.id} value={`template:${t.id}`}>{t.label}</option>)}
              </optgroup>
              {myDesigns.length > 0 && (
                <optgroup label="My designs">
                  {myDesigns.map((d) => <option key={d.id} value={`design:${d.id}`}>{d.title}</option>)}
                </optgroup>
              )}
            </select>
            <Button
              disabled={title.trim().length < 2}
              isLoading={busy === "add"}
              onClick={() => {
                const [kind, sid] = source.split(":");
                post({ action: "add", title, goal, dueAt: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null, ...(kind === "template" ? { templateId: sid } : { designId: sid }) }, "add");
              }}
            >
              Add lab
            </Button>
          </div>
        </Card>
      )}

      {data.labs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {data.canManage ? "No labs yet. Add a guided build or let the AI design one for this topic." : "Your teacher hasn't added build labs to this topic yet. Use the ideas below to build your own."}
        </Card>
      ) : (
        <ol className="space-y-3">
          {data.labs.map((lab, i) => {
            const complete = lab.stepCount > 0 && lab.myDone >= lab.stepCount;
            return (
              <li key={lab.id}>
                <Card className={cn("p-4 space-y-2", complete && "border-emerald-500/40")}>
                  <div className="flex items-start gap-3">
                    <span className="h-8 w-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold flex items-center gap-1.5">{ICON[lab.kind]} {lab.title}</p>
                      {lab.goal && <p className="text-xs text-slate-500">{lab.goal}</p>}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 w-32 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-teal-500" style={{ width: `${(lab.myDone / Math.max(1, lab.stepCount)) * 100}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-500">{lab.myDone}/{lab.stepCount} steps</span>
                        {lab.dueAt && (
                          <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", !complete && new Date(lab.dueAt) < new Date() ? "bg-rose-500/15 text-rose-600" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>
                            {!complete && new Date(lab.dueAt) < new Date() ? "OVERDUE" : "DUE"} {new Date(lab.dueAt).toLocaleDateString()}
                          </span>
                        )}
                        {complete && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 items-end">
                      <Button size="sm" onClick={() => start(lab)} isLoading={busy === lab.id}>
                        {lab.myDesignId ? (complete ? "Open" : "Continue") : "Start lab"}
                      </Button>
                      {data.canManage && (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setRosterFor(rosterFor === lab.id ? null : lab.id)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Student progress">
                            <Users className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => confirm(`Remove “${lab.title}”?`) && post({ action: "remove", labId: lab.id }, `rm-${lab.id}`)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600" aria-label="Remove lab">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {rosterFor === lab.id && lab.roster && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                      {lab.roster.length === 0 ? (
                        <p className="text-xs text-slate-500">No student has started this lab yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {lab.roster
                            .sort((a, b) => b.done - a.done)
                            .map((r) => (
                              <li key={r.designId} className="flex items-center gap-2 text-xs">
                                <span className="w-32 truncate font-semibold">{r.name}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-teal-500" style={{ width: `${(r.done / Math.max(1, lab.stepCount)) * 100}%` }} />
                                </div>
                                <span className="w-12 text-right">{r.done}/{lab.stepCount}</span>
                                <a href={`/studio/${r.designId}`} className="text-teal-600 font-semibold">View</a>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <Card className="p-4 space-y-3 border-violet-500/30">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-violet-500" /> Not sure what to build?</p>
            <p className="text-xs text-slate-500">Get AI ideas for small builds that teach {topicTitle}. Pick one and Maker Studio plans the parts and builds it with you.</p>
          </div>
          <Button size="sm" onClick={suggest} isLoading={ideasBusy} className="bg-violet-600 hover:bg-violet-700">
            {ideas ? "More ideas" : "Suggest ideas"}
          </Button>
        </div>
        {ideas && ideas.length === 0 && <p className="text-xs text-slate-500">No ideas came back — try again.</p>}
        {ideas && ideas.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {ideas.map((idea) => (
              <div key={idea.title} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 flex flex-col">
                <p className="font-bold text-sm flex items-center gap-1.5">{ICON[idea.kind] || ICON.circuit} {idea.title}</p>
                <p className="text-xs text-slate-500 flex-1">{idea.pitch}</p>
                {idea.parts.length > 0 && <p className="text-[10px] text-slate-400">Parts: {idea.parts.join(", ")}</p>}
                <Button size="sm" variant="outline" onClick={() => router.push(`/studio/new?prompt=${encodeURIComponent(idea.buildPrompt)}`)}>
                  Build this
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
