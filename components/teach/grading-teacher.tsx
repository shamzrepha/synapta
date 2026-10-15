"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2, Send, Lock, Eye, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg } from "@/lib/teach/client";
import { ClassSelect, useTeacherClasses } from "@/components/teach/class-picker";
import { needsReview } from "@/lib/grading/scoring";

interface SetRow {
  id: string;
  title: string;
  status: "draft" | "open" | "closed";
  released: boolean;
  questionCount: number;
}
interface Criterion { id: string; criterion: string; marks: number }
interface Question { id: string; prompt: string; modelAnswer: string; rubric: Criterion[]; maxMarks: number }
interface Grade {
  criteria: { id: string; awarded: number; explanation: string }[];
  total: number;
  max: number;
  confidence: number;
  explanation: string;
  status: "auto" | "review" | "final";
  feedback?: string;
}
interface Submission { uid: string; name: string; answers: Record<string, string>; grades: Record<string, Grade>; total: number; maxTotal: number }
interface SetDetail extends SetRow { classId: string; questions: Question[]; submissions: Submission[] }

export function TeacherGrading() {
  const { classes, loading } = useTeacherClasses();
  const [classId, setClassId] = useState("");
  const [sets, setSets] = useState<SetRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (cid: string) => {
    if (!cid) return;
    try {
      setSets(asArray<SetRow>(await api<SetRow[]>(`/api/grading?classId=${encodeURIComponent(cid)}`)));
    } catch {
      setSets([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(classId), 0);
    return () => clearTimeout(t);
  }, [classId, load]);

  if (openId) return <SetManager id={openId} onBack={() => { setOpenId(null); void load(classId); }} />;
  if (creating) return <SetBuilder classId={classId} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Auto-grading</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Short-answer sets marked by AI against your rubric. You review the uncertain ones.</p>
      </header>
      {loading ? <Skeleton className="h-11 w-full rounded-xl" /> : <ClassSelect classes={classes} value={classId} onChange={setClassId} />}
      {classId && (
        <>
          <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New question set</Button>
          <div className="space-y-2">
            {sets.length === 0 && <p className="text-sm text-slate-500">No question sets yet.</p>}
            {sets.map((s) => (
              <button key={s.id} onClick={() => setOpenId(s.id)} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-teal-400 dark:border-slate-800 dark:bg-slate-900">
                <span>
                  <span className="block font-semibold text-slate-900 dark:text-white">{s.title}</span>
                  <span className="text-xs text-slate-500">{s.questionCount} questions</span>
                </span>
                <Badge variant={s.status === "open" ? "emerald" : s.status === "closed" ? "secondary" : "amber"}>{s.status}</Badge>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface DraftQ { prompt: string; modelAnswer: string; rubric: { criterion: string; marks: number }[] }
const emptyQ = (): DraftQ => ({ prompt: "", modelAnswer: "", rubric: [{ criterion: "", marks: 1 }] });

function SetBuilder({ classId, onCancel, onCreated }: { classId: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [qs, setQs] = useState<DraftQ[]>([emptyQ()]);
  const [busy, setBusy] = useState(false);
  const patchQ = (i: number, p: Partial<DraftQ>) => setQs((l) => l.map((q, j) => (j === i ? { ...q, ...p } : q)));

  async function save() {
    setBusy(true);
    try {
      const set = await api<{ id: string }>("/api/grading", { method: "POST", body: { classId, title, questions: qs } });
      onCreated(set.id);
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const valid = title.trim() && qs.every((q) => q.prompt.trim() && q.modelAnswer.trim() && q.rubric.length > 0 && q.rubric.every((r) => r.criterion.trim() && r.marks > 0));

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-6">
      <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">New question set</h1>
      <Input placeholder="Title, e.g. Photosynthesis check" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
      {qs.map((q, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-white">Question {i + 1}</h2>
              <Button variant="ghost" size="icon" aria-label="Remove question" disabled={qs.length <= 1} onClick={() => setQs((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Textarea rows={2} placeholder="Question" value={q.prompt} onChange={(e) => patchQ(i, { prompt: e.target.value })} maxLength={1500} />
            <Textarea rows={3} placeholder="Model answer (students never see this)" value={q.modelAnswer} onChange={(e) => patchQ(i, { modelAnswer: e.target.value })} maxLength={3000} />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rubric: marks per criterion</p>
              {q.rubric.map((r, j) => (
                <div key={j} className="flex gap-2">
                  <Input placeholder="Criterion" value={r.criterion} onChange={(e) => patchQ(i, { rubric: q.rubric.map((x, k) => (k === j ? { ...x, criterion: e.target.value } : x)) })} maxLength={200} />
                  <Input type="number" step={0.5} min={0.5} max={20} className="w-20" aria-label="Marks" value={r.marks} onChange={(e) => patchQ(i, { rubric: q.rubric.map((x, k) => (k === j ? { ...x, marks: Number(e.target.value) } : x)) })} />
                  <Button variant="ghost" size="icon" aria-label="Remove criterion" disabled={q.rubric.length <= 1} onClick={() => patchQ(i, { rubric: q.rubric.filter((_, k) => k !== j) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" disabled={q.rubric.length >= 8} onClick={() => patchQ(i, { rubric: [...q.rubric, { criterion: "", marks: 1 }] })}><Plus className="mr-1 h-4 w-4" /> Criterion</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" disabled={qs.length >= 10} onClick={() => setQs((l) => [...l, emptyQ()])}><Plus className="mr-1 h-4 w-4" /> Question</Button>
        <Button className="ml-auto" onClick={save} disabled={busy || !valid}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save draft</Button>
      </div>
    </div>
  );
}

function SetManager({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useToast();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [tab, setTab] = useState<"review" | "all">("review");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<SetDetail>(`/api/grading/${id}`);
      setSet({ ...d, questions: asArray<Question>(d.questions), submissions: asArray<Submission>(d.submissions) });
    } catch (e) {
      toast({ title: "Could not load", description: errMsg(e), variant: "destructive" });
    }
  }, [id, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/api/grading/${id}`, { method: "PATCH", body });
      await load();
    } catch (e) {
      toast({ title: "Update failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this set and all submissions?")) return;
    try {
      await api(`/api/grading/${id}`, { method: "DELETE" });
      onBack();
    } catch (e) {
      toast({ title: "Could not delete", description: errMsg(e), variant: "destructive" });
    }
  }

  if (!set) return <div className="mx-auto max-w-3xl px-4 py-4"><Skeleton className="h-40 w-full rounded-2xl" /></div>;

  const items = set.submissions.flatMap((s) =>
    set.questions.map((q) => ({ sub: s, q, grade: s.grades?.[q.id] })).filter((x) => x.grade)
  );
  const queue = items.filter((x) => x.grade!.status === "review" || (x.grade!.status === "auto" && needsReview(x.grade!.confidence)));
  const shown = tab === "review" ? queue : items;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-6">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{set.title}</h1>
        <Badge variant={set.status === "open" ? "emerald" : "secondary"}>{set.status}</Badge>
        {set.released && <Badge variant="default">results released</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {set.status === "draft" && <Button size="sm" disabled={busy} onClick={() => patch({ status: "open" })}><Send className="mr-1 h-4 w-4" /> Open to students</Button>}
        {set.status === "open" && <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ status: "closed" })}><Lock className="mr-1 h-4 w-4" /> Close</Button>}
        {set.status === "closed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ status: "open" })}>Reopen</Button>}
        {set.status !== "draft" && (
          <Button size="sm" variant={set.released ? "outline" : "default"} disabled={busy} onClick={() => patch({ released: !set.released })}>
            <Eye className="mr-1 h-4 w-4" /> {set.released ? "Hide results" : "Release results"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
      </div>
      {!set.released && queue.length > 0 && set.status !== "draft" && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" /> {queue.length} answers need review before you release.</p>
      )}

      {set.status === "draft" ? (
        <div className="space-y-2">
          {set.questions.map((q, i) => (
            <Card key={q.id}><CardContent className="space-y-1 p-4 text-sm">
              <p className="font-semibold">{i + 1}. {q.prompt} <span className="text-slate-500">({q.maxMarks} marks)</span></p>
              <p className="text-slate-600 dark:text-slate-400">Model: {q.modelAnswer}</p>
              <ul className="list-disc pl-5 text-slate-600 dark:text-slate-400">{q.rubric.map((r) => <li key={r.id}>{r.criterion} ({r.marks})</li>)}</ul>
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Button size="sm" variant={tab === "review" ? "default" : "outline"} onClick={() => setTab("review")}>Review queue ({queue.length})</Button>
            <Button size="sm" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>All answers ({items.length})</Button>
          </div>
          {shown.length === 0 && <p className="text-sm text-slate-500">{tab === "review" ? "Nothing to review." : "No submissions yet."}</p>}
          {shown.map((x) => (
            <AnswerCard key={`${x.sub.uid}-${x.q.id}`} setId={id} sub={x.sub} q={x.q} grade={x.grade!} onSaved={load} />
          ))}
        </>
      )}
    </div>
  );
}

function AnswerCard({ setId, sub, q, grade, onSaved }: { setId: string; sub: Submission; q: Question; grade: Grade; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [marks, setMarks] = useState<Record<string, number>>(() => Object.fromEntries(grade.criteria.map((c) => [c.id, c.awarded])));
  const [feedback, setFeedback] = useState(grade.feedback || "");
  const [busy, setBusy] = useState(false);
  const total = Object.values(marks).reduce((a, b) => a + (Number(b) || 0), 0);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/grading/${setId}/override`, { method: "POST", body: { uid: sub.uid, questionId: q.id, awarded: marks, feedback } });
      toast({ title: "Saved", variant: "success" });
      await onSaved();
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-white">{sub.name}</span>
          <Badge variant="outline">{q.id.replace("q", "Q")}</Badge>
          {grade.status === "final" ? <Badge variant="emerald"><Check className="mr-1 h-3 w-3" />reviewed</Badge> : <Badge variant="amber">AI confidence {Math.round(grade.confidence * 100)}%</Badge>}
        </div>
        <p className="text-slate-500">{q.prompt}</p>
        <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200">{sub.answers?.[q.id] || <em>No answer</em>}</p>
        {grade.explanation && <p className="text-xs text-slate-500">AI: {grade.explanation}</p>}
        <div className="space-y-1.5">
          {q.rubric.map((r) => {
            const ai = grade.criteria.find((c) => c.id === r.id);
            return (
              <div key={r.id} className="flex items-center gap-2">
                <span className="flex-1 text-slate-700 dark:text-slate-300">{r.criterion}{ai?.explanation ? <span className="block text-xs text-slate-500">{ai.explanation}</span> : null}</span>
                <Input type="number" step={0.5} min={0} max={r.marks} className="w-20" aria-label={`Marks for ${r.criterion}`} value={marks[r.id] ?? 0} onChange={(e) => setMarks((m) => ({ ...m, [r.id]: Math.min(r.marks, Math.max(0, Number(e.target.value))) }))} />
                <span className="w-8 text-xs text-slate-500">/ {r.marks}</span>
              </div>
            );
          })}
        </div>
        <Textarea rows={2} placeholder="Feedback for the student (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1500} />
        <div className="flex items-center justify-between">
          <span className="font-semibold">{total} / {q.maxMarks}</span>
          <Button size="sm" onClick={save} disabled={busy}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{grade.status === "final" ? "Update" : "Confirm marks"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
