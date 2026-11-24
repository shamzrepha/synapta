"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useEffect(() => {
    fetch("/api/profile/academic").then((r) => r.json()).then((j) => j.ok && setInsts(asArray<Inst>(j.data.institutions))).catch(() => null);
  }, []);
  const departments = (insts.find((i) => i.id === instId)?.schools ?? []).flatMap((s) => s.departments).sort();
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
  if (user && user.role !== "admin") return <p className="text-sm">This page is for admins.</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Timetables and course outlines</h1>
      <p className="text-sm text-muted-foreground">Paste a department&apos;s timetable or course outline. The AI sorts out the courses and times. A course code that another department already has becomes one shared course.</p>
      <Card className="space-y-3 p-4">
        <select className={field} value={instId} onChange={(e) => { setInstId(e.target.value); setDept(""); }} aria-label="School">{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <select className={field} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">Department</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <div className="flex gap-2">
          <select className={field} value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Level">{[100, 200, 300, 400, 500].map((l) => <option key={l} value={l}>{l} level</option>)}</select>
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as "timetable" | "outline")} aria-label="What you are pasting"><option value="timetable">Timetable</option><option value="outline">Course outline</option></select>
        </div>
        <textarea className="min-h-[200px] w-full rounded-lg border border-border bg-background p-3 text-sm" placeholder="Paste the text here" value={text} onChange={(e) => setText(e.target.value)} aria-label="Pasted text" />
        <Button isLoading={busy} disabled={!dept || text.trim().length < 20} onClick={() => void go()}>Read and save</Button>
        {result && <p className="text-sm">{result}</p>}
      </Card>
    </div>
  );
}
