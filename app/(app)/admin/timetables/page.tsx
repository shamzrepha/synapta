"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
import { extractTextFromFile } from "@/lib/pdf/extractor";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";

interface School { id: string; name: string; departments: string[] }
interface Inst { id: string; name: string; schools: School[] }
const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

export default function TimetablesPage() {
  const user = useUserStore((s) => s.user);
  const { toast } = useToast();
  const [insts, setInsts] = useState<Inst[]>([]);
  const [instId, setInstId] = useState("futo");
  const [dept, setDept] = useState("");
  const [level, setLevel] = useState(100);
  const [kind, setKind] = useState<"timetable" | "outline">("timetable");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useEffect(() => {
    fetch("/api/profile/academic").then((r) => r.json()).then((j) => j.ok && setInsts(asArray<Inst>(j.data.institutions))).catch(() => null);
  }, []);
  const departments = (insts.find((i) => i.id === instId)?.schools ?? []).flatMap((s) => s.departments).sort();
  const pick = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const bad = list.find((f) => !(f.type === "application/pdf" || f.type.startsWith("image/") || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name)));
    if (bad) return toast({ title: "Use a PDF or a photo", description: `${bad.name} isn't one. In Word, use Save as PDF first.`, variant: "destructive" });
    setReading("Reading…");
    try {
      const parts: string[] = [];
      for (const f of list) parts.push(await extractTextFromFile(f, (m) => setReading(m)));
      setText((prev) => [prev.trim(), ...parts].filter(Boolean).join("\n\n").slice(0, 30_000));
      setFileName(list.map((f) => f.name).join(", "));
    } catch (e) {
      toast({ title: "Couldn't read that file", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setReading("");
    }
  };
  const go = async () => {
    setBusy(true);
    setResult("");
    try {
      const res = await fetch("/api/admin/academic-ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution: instId, department: dept, level, kind, text }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return toast({ title: "Couldn't read it", description: j?.error?.message, variant: "destructive" });
      const sh = asArray<{ code: string; with: string[] }>(j.data.shared);
      setResult(`Found ${asArray(j.data.courses).length} courses and ${j.data.slots} time slots.${sh.length ? ` Shared with other departments: ${sh.map((s) => s.code).join(", ")}.` : ""}`);
      toast({ title: "Saved", variant: "success" });
    } finally {
      setBusy(false);
    }
  };
  const makeClasses = async () => {
    const res = await fetch("/api/admin/course-classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution: instId }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return toast({ title: "Couldn't make classes", description: j?.error?.message, variant: "destructive" });
    toast({ title: `Made ${j.data.created} new classes, updated ${j.data.updated}`, variant: "success" });
  };
  if (user && user.role !== "admin") return <p className="text-sm">This page is for admins.</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Timetables and course outlines</h1>
      <p className="text-sm text-muted-foreground">Upload a department&apos;s timetable or course outline as a PDF or photos. Pasting text is the last resort. The AI sorts out the courses and times. A course code that another department already has becomes one shared course.</p>
      <Card className="space-y-3 p-4">
        <select className={field} value={instId} onChange={(e) => { setInstId(e.target.value); setDept(""); }} aria-label="School">{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <select className={field} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">Department</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <div className="flex gap-2">
          <select className={field} value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Level">{[100, 200, 300, 400, 500].map((l) => <option key={l} value={l}>{l} level</option>)}</select>
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as "timetable" | "outline")} aria-label="What you are pasting"><option value="timetable">Timetable</option><option value="outline">Course outline</option></select>
        </div>
        <label className="block text-sm font-medium">PDF or photos
          <input type="file" multiple accept=".pdf,application/pdf,image/*" className="mt-1 block w-full text-sm" onChange={(e) => void pick(e.target.files)} aria-label="Timetable or outline: PDF or photos" />
        </label>
        {reading && <p className="text-xs text-muted-foreground">{reading}</p>}
        {fileName && !reading && <p className="text-xs text-muted-foreground">Read {fileName}: {text.length.toLocaleString()} characters.</p>}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">No file? Paste the text instead (last resort)</summary>
          <textarea className="mt-2 min-h-[160px] w-full rounded-lg border border-border bg-background p-3 text-sm" placeholder="Paste the text here" value={text} onChange={(e) => setText(e.target.value)} aria-label="Pasted text" />
        </details>
        <Button isLoading={busy} disabled={!dept || text.trim().length < 20 || !!reading} onClick={() => void go()}>Read and save</Button>
        {result && <p className="text-sm">{result}</p>}
      </Card>
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Make a class for every course</p>
        <p className="text-xs text-muted-foreground">Creates an empty class for each course of this school that has none, and keeps shared courses as one class for all their departments. Nothing is built by AI.</p>
        <Button variant="outline" onClick={() => void makeClasses()}>Make the classes</Button>
      </Card>
    </div>
  );
}
