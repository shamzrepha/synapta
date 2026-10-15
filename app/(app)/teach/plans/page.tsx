"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Printer, RefreshCw, Pencil, Save, Trash2, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg } from "@/lib/teach/client";
import { ClassSelect, useTeacherClasses } from "@/components/teach/class-picker";
import { LessonEditor, LessonView } from "@/components/teach/lesson-editor";
import type { Lesson } from "@/lib/plans/schema";

interface Plan {
  id: string;
  classId: string;
  title: string;
  durationMin: number;
  lessons: Lesson[];
  updatedAt: string;
}

export default function LessonPlansPage() {
  const { toast } = useToast();
  const { classes, loading: classesLoading } = useTeacherClasses();
  const [classId, setClassId] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [open, setOpen] = useState<Plan | null>(null);

  // generator form
  const [syllabus, setSyllabus] = useState("");
  const [duration, setDuration] = useState(45);
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPlans = useCallback(async (cid: string) => {
    if (!cid) {
      setPlans([]);
      return;
    }
    setPlansLoading(true);
    try {
      setPlans(asArray<Plan>(await api<Plan[]>(`/api/plans?classId=${encodeURIComponent(cid)}`)));
    } catch {
      setPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadPlans(classId), 0);
    return () => clearTimeout(t);
  }, [classId, loadPlans]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const { extractTextFromFile } = await import("@/lib/pdf/extract");
      const text = await extractTextFromFile(file);
      setSyllabus(text.slice(0, 40000));
      toast({ title: "Syllabus loaded", description: `${file.name}`, variant: "success" });
    } catch (e) {
      toast({ title: "Could not read that file", description: errMsg(e), variant: "destructive" });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const plan = await api<Plan>("/api/plans/generate", {
        method: "POST",
        body: { classId, syllabus, durationMin: duration, lessons: count },
      });
      setOpen(plan);
      setPlans((p) => [plan, ...p]);
      toast({ title: "Lesson plans ready", variant: "success" });
    } catch (e) {
      toast({ title: "Generation failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return (
      <PlanDetail
        plan={open}
        onBack={() => setOpen(null)}
        onChanged={(p) => {
          setOpen(p);
          setPlans((list) => list.map((x) => (x.id === p.id ? p : x)));
        }}
        onDeleted={(id) => {
          setOpen(null);
          setPlans((list) => list.filter((x) => x.id !== id));
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">AI lesson plans</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Upload a syllabus and get timed lessons with an exit-ticket quiz.</p>
      </header>

      {classesLoading ? (
        <Skeleton className="h-11 w-full rounded-xl" />
      ) : classes.length === 0 ? (
        <Card><CardContent className="p-5 text-sm text-slate-600 dark:text-slate-400">Create a class first, then come back to plan its lessons.</CardContent></Card>
      ) : (
        <ClassSelect classes={classes} value={classId} onChange={setClassId} />
      )}

      {classId && (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Syllabus</label>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={reading}>
                  {reading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />}
                  Upload PDF / text
                </Button>
                <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
              <Textarea rows={7} placeholder="Paste the syllabus or topic outline here…" value={syllabus} onChange={(e) => setSyllabus(e.target.value)} maxLength={40000} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Minutes per lesson</label>
                  <Input type="number" min={10} max={240} value={duration} onChange={(e) => setDuration(Math.min(240, Math.max(10, Number(e.target.value) || 45)))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Number of lessons</label>
                  <Input type="number" min={1} max={12} value={count} onChange={(e) => setCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />
                </div>
              </div>
              <Button className="w-full" onClick={generate} disabled={busy || syllabus.trim().length < 20}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {busy ? "Planning… this can take a minute" : "Generate lesson plans"}
              </Button>
            </CardContent>
          </Card>

          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Saved plans</h2>
            {plansLoading ? (
              <Skeleton className="h-16 w-full rounded-2xl" />
            ) : plans.length === 0 ? (
              <p className="text-sm text-slate-500">No plans for this class yet.</p>
            ) : (
              plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpen(p)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-teal-400 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span>
                    <span className="block font-semibold text-slate-900 dark:text-white">{p.title}</span>
                    <span className="text-xs text-slate-500">{p.lessons.length} lessons · {p.durationMin} min · {new Date(p.updatedAt).toLocaleDateString()}</span>
                  </span>
                </button>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PlanDetail({
  plan,
  onBack,
  onChanged,
  onDeleted,
}: {
  plan: Plan;
  onBack: () => void;
  onChanged: (p: Plan) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function saveLesson() {
    if (editing === null || !draft) return;
    setBusy("save");
    try {
      const lessons = plan.lessons.map((l, i) => (i === editing ? draft : l));
      const saved = await api<Plan>(`/api/plans/${plan.id}`, { method: "PATCH", body: { lessons } });
      onChanged({ ...plan, ...saved });
      setEditing(null);
      setDraft(null);
      toast({ title: "Saved", variant: "success" });
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function regenerate(index: number) {
    setBusy(`regen${index}`);
    try {
      const r = await api<{ lesson: Lesson; updatedAt: string }>(`/api/plans/${plan.id}/regenerate`, {
        method: "POST",
        body: { index, note: note || undefined },
      });
      onChanged({ ...plan, lessons: plan.lessons.map((l, i) => (i === index ? r.lesson : l)), updatedAt: r.updatedAt });
      setVersion((v) => v + 1);
      setNote("");
      toast({ title: `Lesson ${index + 1} regenerated`, variant: "success" });
    } catch (e) {
      toast({ title: "Regeneration failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this plan?")) return;
    try {
      await api(`/api/plans/${plan.id}`, { method: "DELETE" });
      onDeleted(plan.id);
    } catch (e) {
      toast({ title: "Could not delete", description: errMsg(e), variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-4 sm:px-6">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .plan-print, .plan-print * { visibility: visible !important; }
        .plan-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 12mm; color: #000 !important; background: #fff !important; }
        .plan-print article { page-break-after: always; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
          <Button variant="outline" size="sm" onClick={remove}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
        </div>
      </div>

      <div className="plan-print space-y-6">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{plan.title}</h1>
          <p className="text-sm text-slate-500">{plan.lessons.length} lessons · {plan.durationMin} minutes each</p>
        </header>

        {plan.lessons.map((lesson, i) => (
          <div key={`${i}-${version}`} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 print:border-0 print:p-0">
            {editing === i && draft ? (
              <>
                <LessonEditor lesson={draft} onChange={setDraft} />
                <div className="no-print mt-4 flex gap-2">
                  <Button size="sm" onClick={saveLesson} disabled={busy === "save"}>
                    {busy === "save" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setDraft(null); }}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <LessonView lesson={lesson} index={i} />
                <div className="no-print mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(i); setDraft(lesson); }}>
                      <Pencil className="mr-1 h-4 w-4" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => regenerate(i)} disabled={busy !== null}>
                      {busy === `regen${i}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Regenerate
                    </Button>
                  </div>
                  <Input placeholder="Optional note for regenerating (e.g. more group work)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
