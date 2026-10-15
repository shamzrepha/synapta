"use client";

import React, { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Circle, Pause, Play, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { SimCanvas } from "@/components/experiments/sim-canvas";
import { SavedRuns } from "@/components/experiments/saved-runs";
import { columnLabel, defaultValues, recordRow } from "@/lib/experiments/defs";
import { drawGraph } from "@/lib/experiments/plot";
import { checkAnswer } from "@/lib/experiments/questions";
import { MAX_ROWS } from "@/lib/experiments/runs";
import type { Experiment, Param, Values } from "@/lib/experiments/types";
import { cn } from "@/lib/utils";

function fmt(x: number, digits = 2): string {
  return Number.isFinite(x) ? x.toFixed(digits) : "–";
}

function ParamControl({ p, value, onChange }: { p: Param; value: number; onChange: (v: number) => void }) {
  if (p.options) {
    return (
      <div>
        <p className="text-xs font-semibold mb-1">{p.label}</p>
        <div className="flex flex-wrap gap-1.5">
          {p.options.map((o) => (
            <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold min-h-9", Math.abs(o.value - value) < 1e-9 ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-700")}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-semibold">
        <span>{p.label}</span>
        <span className="font-mono text-teal-600">{+value.toFixed(4)} {p.unit}</span>
      </span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-teal-600 h-8" />
    </label>
  );
}

export function Lab({ exp }: { exp: Experiment }) {
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(() => defaultValues(exp));
  const [paused, setPaused] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, number>>>([]);
  const [answers, setAnswers] = useState<Record<string, { text: string; ok: boolean | null; msg: string }>>({});
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState(0);

  const c = useMemo(() => exp.compute(values), [exp, values]);
  const animated = c.duration !== 0;
  const set = (key: string, v: number) => setValues((cur) => ({ ...cur, [key]: v }));

  const drawMain = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => exp.draw(ctx, w, h, values, c, t), [exp, values, c]);

  const record = () => {
    if (rows.length >= MAX_ROWS) return toast({ title: `Up to ${MAX_ROWS} rows per run`, variant: "amber" });
    setRows((r) => [...r, recordRow(exp, values, c)]);
  };

  const check = (id: string) => {
    const q = exp.questions.find((x) => x.id === id)!;
    const a = answers[id]?.text ?? "";
    const r = checkAnswer(q, a, values, c);
    setAnswers((cur) => ({ ...cur, [id]: { text: a, ok: r.correct, msg: r.message } }));
  };

  const solved = exp.questions.filter((q) => answers[q.id]?.ok).map((q) => q.id);

  const save = async () => {
    if (!rows.length) return;
    setSaving(true);
    try {
      const j = await fetch("/api/experiments/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment: exp.id, title, note, params: values, rows, solved }),
      }).then((r) => r.json());
      if (j.ok) {
        toast({ title: "Run saved", description: "Find it under Saved runs.", variant: "success" });
        setRows([]);
        setTitle("");
        setNote("");
        setSavedKey((k) => k + 1);
      } else toast({ title: "Couldn't save", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't reach the server", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <SimCanvas draw={drawMain} animated={animated} paused={paused} className="h-64 sm:h-80" />
        <div className="flex items-center gap-2">
          {animated && (
            <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />} {paused ? "Play" : "Pause"}
            </Button>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-400 flex-1">{exp.tryThis}</p>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-bold">Controls</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {exp.params
            .filter((p) => !(exp.id === "titration" && p.key === "pKa" && values.weak !== 1))
            .map((p) => <ParamControl key={p.key} p={p} value={values[p.key]} onChange={(v) => set(p.key, v)} />)}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-bold">Results</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {c.outputs.map((o) => (
            <div key={o.key} className="rounded-xl bg-slate-50 dark:bg-slate-900 px-3 py-2">
              <dt className="text-[11px] text-slate-500">{o.label}</dt>
              <dd className="text-base font-extrabold font-mono">{fmt(o.value, o.digits ?? 2)} <span className="text-xs font-semibold text-slate-500">{o.unit}</span></dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {c.graphs.map((g, i) => (
          <Card key={i} className="p-2">
            <SimCanvas draw={(ctx, w, h, t) => drawGraph(ctx, w, h, g, t)} animated={!!g.markerAt} paused={paused} className="h-52" />
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold flex-1">Data table <span className="font-normal text-slate-500">({rows.length}/{MAX_ROWS})</span></h2>
          <Button size="sm" onClick={record}><Plus className="h-4 w-4 mr-1" /> Record this row</Button>
          {rows.length > 0 && <Button size="sm" variant="outline" onClick={() => setRows([])}><Trash2 className="h-4 w-4" /></Button>}
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">Change the controls, then press Record to add a row. Record several settings to look for a pattern.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="text-[11px] w-full">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  {exp.recordKeys.map((k) => <th key={k} className="px-2 py-1.5 text-left whitespace-nowrap font-semibold">{columnLabel(exp, k)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1">{i + 1}</td>
                    {exp.recordKeys.map((k) => <td key={k} className="px-2 py-1 font-mono">{r[k] ?? "–"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={`Name this run (e.g. ${exp.title} – lengths)`} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-sm" />
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="What did you notice? (optional)" />
            <Button onClick={save} isLoading={saving}><Save className="h-4 w-4 mr-1" /> Save run to my account</Button>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold flex-1">Guided questions</h2>
          <span className="text-xs font-semibold text-teal-600">{solved.length}/{exp.questions.length} solved</span>
        </div>
        <p className="text-xs text-slate-500">Answers are checked against what the simulator shows right now, so change the controls first if a question asks you to.</p>
        {exp.questions.map((q, i) => {
          const a = answers[q.id];
          return (
            <div key={q.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <p className="text-sm font-semibold flex gap-2">
                {a?.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> : <Circle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />}
                <span>{i + 1}. {q.prompt}</span>
              </p>
              {q.kind === "choice" ? (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((o) => (
                    <button key={o} type="button" onClick={() => setAnswers((cur) => ({ ...cur, [q.id]: { text: o, ok: null, msg: "" } }))} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold min-h-9", a?.text === o ? "border-teal-500 bg-teal-500/10" : "border-slate-200 dark:border-slate-700")}>{o}</button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input inputMode="decimal" value={a?.text ?? ""} onChange={(e) => setAnswers((cur) => ({ ...cur, [q.id]: { text: e.target.value, ok: null, msg: "" } }))} placeholder="Your answer" className="h-10 w-36 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-sm font-mono" aria-label="Answer" />
                  {q.unit && <span className="text-xs text-slate-500">{q.unit}</span>}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => check(q.id)} disabled={!a?.text}>Check</Button>
                {a?.ok !== null && a?.ok !== undefined && <span className={cn("text-xs", a.ok ? "text-emerald-600 font-semibold" : "text-amber-700 dark:text-amber-300")}>{a.ok ? "✓ Correct" : `Not yet. ${a.msg}`}</span>}
              </div>
            </div>
          );
        })}
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">Saved runs</h2>
        <SavedRuns experiment={exp.id} refreshKey={savedKey} />
      </div>
    </div>
  );
}
