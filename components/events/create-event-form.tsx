"use client";

import React, { useEffect, useState } from "react";
import { X, Zap, Hammer, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { asArray } from "@/lib/api/client";

interface ClassLite {
  id: string;
  title: string;
}

function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BUILD_TEMPLATES = [
  { id: "gear-lift", label: "Gear reduction winch (mechanism)", kind: "mechanism" },
  { id: "hand-winch", label: "Hand-crank winch (mechanism)", kind: "mechanism" },
  { id: "traffic-light", label: "Traffic light (circuit + code)", kind: "circuit" },
  { id: "blink", label: "Blink (circuit + code)", kind: "circuit" },
  { id: "button-led", label: "Button light (circuit + code)", kind: "circuit" },
  { id: "night-light", label: "Night light (sensor + code)", kind: "circuit" },
] as const;

export function CreateEventForm({
  classes,
  onClose,
  onCreated,
}: {
  classes: ClassLite[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<"quiz_sprint" | "hackathon" | "build">("quiz_sprint");
  const [buildTemplate, setBuildTemplate] = useState("gear-lift");
  const [loadMass, setLoadMass] = useState(3);
  const [liftHeight, setLiftHeight] = useState(1);
  const [inputKind, setInputKind] = useState<"motor" | "crank">("motor");
  const [stallTorque, setStallTorque] = useState(0.05);
  const [freeRpm, setFreeRpm] = useState(6000);
  const [crankForce, setCrankForce] = useState(40);
  const [maxStages, setMaxStages] = useState(3);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [kcs, setKcs] = useState<Array<{ id: string; title: string }>>([]);
  const [kcId, setKcId] = useState("");
  const [visibility, setVisibility] = useState<"class" | "public">(classes.length ? "class" : "public");
  const [startAt, setStartAt] = useState(() => localInputValue(new Date(Date.now() + 10 * 60 * 1000)));
  const [duration, setDuration] = useState(30);
  const [questionCount, setQuestionCount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!classId) return;
    fetch(`/api/classes/${classId}`)
      .then((r) => r.json())
      .then((j) => setKcs(j.ok ? (j.data.kcs || []).map((k: { id: string; title: string }) => ({ id: k.id, title: k.title })) : []))
      .catch(() => setKcs([]));
  }, [classId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title,
          description,
          topic,
          classId: classId || null,
          kcId: kind === "quiz_sprint" && kcId ? kcId : null,
          visibility,
          startAt: new Date(startAt).toISOString(),
          durationMinutes: duration,
          questionCount,
          secondsPerQuestion: seconds,
          build:
            kind === "build"
              ? BUILD_TEMPLATES.find((t) => t.id === buildTemplate)?.kind === "circuit"
                ? { designKind: "circuit", templateId: buildTemplate }
                : {
                    designKind: "mechanism",
                    templateId: buildTemplate,
                    loadMass,
                    liftHeight,
                    maxStages,
                    input: inputKind === "motor" ? { kind: "motor", stallTorque, freeRpm } : { kind: "crank", force: crankForce, crankRadius: 0.1, crankRpm: 60 },
                  }
              : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) onCreated(data.data.id);
      else toast({ title: "Couldn't create the challenge", description: data.error?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const presets = kind === "quiz_sprint" ? [10, 30, 60, 1440] : [120, 1440, 2880, 10080];
  const presetLabel = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : `${m / 1440} day${m > 1440 ? "s" : ""}`);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form onSubmit={submit} className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-950 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">New challenge</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "quiz_sprint" as const, label: "Quiz sprint", desc: "Timed AI quiz, speed scoring", icon: <Zap className="h-5 w-5 text-amber-500" /> },
            { k: "hackathon" as const, label: "Hackathon", desc: "Build & submit, peers vote", icon: <Hammer className="h-5 w-5 text-indigo-500" /> },
            { k: "build" as const, label: "Build challenge", desc: "Design in Maker Studio, auto-scored by simulation", icon: <Wrench className="h-5 w-5 text-teal-500" /> },
          ].map((o) => (
            <button
              type="button"
              key={o.k}
              onClick={() => {
                setKind(o.k);
                setDuration(o.k === "quiz_sprint" ? 30 : o.k === "build" ? 60 : 1440);
              }}
              className={cn("p-3 rounded-2xl border-2 text-left", kind === o.k ? "border-teal-500 bg-teal-500/5" : "border-slate-200 dark:border-slate-800")}
            >
              {o.icon}
              <p className="font-semibold text-sm mt-1">{o.label}</p>
              <p className="text-[11px] text-slate-500">{o.desc}</p>
            </button>
          ))}
        </div>

        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "hackathon" ? "e.g. Build a circuit simulator" : "e.g. Friday Ohm's Law Showdown"} required minLength={3} />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={kind === "hackathon" ? "The brief: what to build, rules, judging criteria…" : "Optional: what this sprint covers"}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-semibold">
            Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm font-normal">
              <option value="">No class (public)</option>
              {asArray(classes).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Who can join
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as "class" | "public")} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm font-normal">
              {classId && <option value="class">Class members</option>}
              <option value="public">Everyone</option>
            </select>
          </label>
        </div>

        {kind === "quiz_sprint" && (
          <>
            {kcs.length > 0 && (
              <label className="space-y-1 text-xs font-semibold block">
                Topic from the class (questions are grounded in its lesson)
                <select value={kcId} onChange={(e) => setKcId(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm font-normal">
                  <option value="">— or describe a topic below —</option>
                  {kcs.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!kcId && <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. 'Kirchhoff's laws for GCSE physics'" />}
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-semibold">
                Questions
                <Input type="number" min={5} max={25} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Seconds per question
                <Input type="number" min={10} max={120} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
              </label>
            </div>
          </>
        )}

        {kind === "build" && (
          <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
            <label className="space-y-1 text-xs font-semibold block">
              Project
              <select value={buildTemplate} onChange={(e) => setBuildTemplate(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm font-normal">
                {BUILD_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            {BUILD_TEMPLATES.find((t) => t.id === buildTemplate)?.kind === "mechanism" ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1 text-xs font-semibold">Load (kg)<Input type="number" min={0.1} step={0.1} value={loadMass} onChange={(e) => setLoadMass(Number(e.target.value))} /></label>
                  <label className="space-y-1 text-xs font-semibold">Height (m)<Input type="number" min={0.1} step={0.1} value={liftHeight} onChange={(e) => setLiftHeight(Number(e.target.value))} /></label>
                  <label className="space-y-1 text-xs font-semibold">Max stages<Input type="number" min={1} max={6} value={maxStages} onChange={(e) => setMaxStages(Number(e.target.value))} /></label>
                </div>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <label className="space-y-1 text-xs font-semibold">
                    Input
                    <select value={inputKind} onChange={(e) => setInputKind(e.target.value as "motor" | "crank")} className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm font-normal">
                      <option value="motor">Motor</option>
                      <option value="crank">Hand crank</option>
                    </select>
                  </label>
                  {inputKind === "motor" ? (
                    <>
                      <label className="space-y-1 text-xs font-semibold">Stall N·m<Input type="number" min={0.001} step={0.01} value={stallTorque} onChange={(e) => setStallTorque(Number(e.target.value))} /></label>
                      <label className="space-y-1 text-xs font-semibold">Free rpm<Input type="number" min={10} step={100} value={freeRpm} onChange={(e) => setFreeRpm(Number(e.target.value))} /></label>
                    </>
                  ) : (
                    <label className="space-y-1 text-xs font-semibold col-span-2">Push force (N)<Input type="number" min={1} value={crankForce} onChange={(e) => setCrankForce(Number(e.target.value))} /></label>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">Everyone gets the same load, height and input; they choose gears, drum and pulleys. Fastest lift wins.</p>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">Entrants wire and code it; the project&apos;s behaviour tests are the judge. Tidier builds break ties.</p>
            )}
          </div>
        )}

        <label className="space-y-1 text-xs font-semibold block">
          Starts
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        </label>
        <div className="space-y-1">
          <p className="text-xs font-semibold">{kind === "hackathon" ? "Building time" : "Open for"}</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setDuration(m)}
                className={cn("px-3 py-1.5 rounded-full border text-xs font-semibold", duration === m ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-800")}
              >
                {presetLabel(m)}
              </button>
            ))}
          </div>
          {kind === "hackathon" && <p className="text-[11px] text-slate-500">Voting stays open 24 hours after submissions close.</p>}
        </div>

        <p className="text-[11px] text-slate-500">Rewards: 🥇 200 XP · 🥈 120 XP · 🥉 80 XP · everyone who takes part 20 XP.</p>
        <Button type="submit" className="w-full" isLoading={saving}>
          {kind === "quiz_sprint" ? "Generate questions & schedule" : kind === "build" ? "Launch build challenge" : "Launch hackathon"}
        </Button>
        {saving && kind === "quiz_sprint" && <p className="text-xs text-center text-slate-500">Writing and checking questions… about 20 seconds.</p>}
      </form>
    </div>
  );
}
