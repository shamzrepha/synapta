"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { Lesson } from "@/lib/plans/schema";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function LessonView({ lesson, index }: { lesson: Lesson; index: number }) {
  return (
    <article className="space-y-3 text-sm text-slate-800 dark:text-slate-200 break-inside-avoid">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
        Lesson {index + 1}: {lesson.title}
      </h3>
      <Section title="Objectives">
        <ul className="list-disc pl-5 space-y-0.5">{lesson.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
      </Section>
      <Section title="Activities">
        <ol className="space-y-1.5">
          {lesson.activities.map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-14 shrink-0 font-mono text-xs text-teal-700 dark:text-teal-400">{a.minutes} min</span>
              <span>
                <strong>{a.title}.</strong> {a.description}
              </span>
            </li>
          ))}
        </ol>
      </Section>
      {lesson.materials.length > 0 && (
        <Section title="Materials">
          <ul className="list-disc pl-5">{lesson.materials.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </Section>
      )}
      <Section title="Differentiation">
        {lesson.differentiation.support && <p><strong>Support:</strong> {lesson.differentiation.support}</p>}
        {lesson.differentiation.extension && <p><strong>Extension:</strong> {lesson.differentiation.extension}</p>}
      </Section>
      <Section title="Exit ticket">
        <ol className="space-y-2 list-decimal pl-5">
          {lesson.exitTicket.map((q, i) => (
            <li key={i}>
              <p>{q.question}</p>
              <ul className="pl-1">
                {q.options.map((o, j) => (
                  <li key={j} className={j === q.answerIndex ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}>
                    {String.fromCharCode(65 + j)}. {o}
                    {j === q.answerIndex ? " (answer)" : ""}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="text-xs text-slate-500 dark:text-slate-400">{q.explanation}</p>}
            </li>
          ))}
        </ol>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{children}</label>;
}

export function LessonEditor({ lesson, onChange }: { lesson: Lesson; onChange: (l: Lesson) => void }) {
  const set = (patch: Partial<Lesson>) => onChange({ ...lesson, ...patch });
  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label>Title</Label>
        <Input value={lesson.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div>
        <Label>Objectives (one per line)</Label>
        <Textarea rows={3} defaultValue={lesson.objectives.join("\n")} onChange={(e) => set({ objectives: lines(e.target.value).length ? lines(e.target.value) : [""] })} />
      </div>
      <div className="space-y-2">
        <Label>Activities</Label>
        {lesson.activities.map((a, i) => (
          <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-2">
            <div className="flex gap-2">
              <Input
                value={a.title}
                aria-label="Activity title"
                onChange={(e) => set({ activities: lesson.activities.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
              />
              <Input
                type="number"
                min={1}
                className="w-20"
                value={a.minutes}
                aria-label="Minutes"
                onChange={(e) => set({ activities: lesson.activities.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) || 1 } : x)) })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove activity"
                disabled={lesson.activities.length <= 1}
                onClick={() => set({ activities: lesson.activities.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              rows={2}
              value={a.description}
              onChange={(e) => set({ activities: lesson.activities.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
            />
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => set({ activities: [...lesson.activities, { title: "New activity", minutes: 5, description: "" }] })}>
          <Plus className="h-4 w-4 mr-1" /> Add activity
        </Button>
      </div>
      <div>
        <Label>Materials (one per line)</Label>
        <Textarea rows={2} defaultValue={lesson.materials.join("\n")} onChange={(e) => set({ materials: lines(e.target.value) })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Support</Label>
          <Textarea rows={3} value={lesson.differentiation.support} onChange={(e) => set({ differentiation: { ...lesson.differentiation, support: e.target.value } })} />
        </div>
        <div>
          <Label>Extension</Label>
          <Textarea rows={3} value={lesson.differentiation.extension} onChange={(e) => set({ differentiation: { ...lesson.differentiation, extension: e.target.value } })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Exit ticket</Label>
        {lesson.exitTicket.map((q, i) => {
          const upd = (patch: Partial<typeof q>) => set({ exitTicket: lesson.exitTicket.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-2">
              <Input value={q.question} aria-label="Question" onChange={(e) => upd({ question: e.target.value })} />
              <Textarea
                rows={3}
                defaultValue={q.options.join("\n")}
                aria-label="Options, one per line"
                onChange={(e) => {
                  const opts = lines(e.target.value);
                  if (opts.length >= 2) upd({ options: opts.slice(0, 5), answerIndex: Math.min(q.answerIndex, opts.length - 1) });
                }}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Correct option</span>
                <select
                  value={q.answerIndex}
                  onChange={(e) => upd({ answerIndex: Number(e.target.value) })}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {q.options.map((_, j) => (
                    <option key={j} value={j}>{String.fromCharCode(65 + j)}</option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label="Remove question"
                  disabled={lesson.exitTicket.length <= 1}
                  onClick={() => set({ exitTicket: lesson.exitTicket.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
