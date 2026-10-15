"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Loader2, Search, ShieldAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/studio/part-shop";
import { compressImage } from "@/lib/image-compress";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Diagnosis } from "@/lib/studio/debug/schema";

interface Item {
  id: string;
  symptom: string;
  setup: string;
  parts: string[];
  diagnosis: Diagnosis;
  createdAt: string | null;
}

const CONF: Record<string, string> = { low: "bg-amber-500/15 text-amber-700 dark:text-amber-300", medium: "bg-sky-500/15 text-sky-700 dark:text-sky-300", high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
const EVIDENCE: Record<string, string> = { photo: "seen in the photo", symptom: "inferred from what you described", datasheet: "from the part's datasheet" };

async function shrink(file: File): Promise<string> {
  let url = await compressImage(file, 1280, 0.78);
  for (const [side, q] of [[1100, 0.7], [900, 0.62], [720, 0.55]] as const) {
    if (url.length <= 1_000_000) break;
    url = await compressImage(file, side, q);
  }
  return url;
}

export default function DebugPage() {
  const { toast } = useToast();
  const shop = useShop();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [symptom, setSymptom] = useState("");
  const [setup, setSetup] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Item | null>(null);
  const [history, setHistory] = useState<Item[] | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/studio/debug")
      .then((r) => r.json())
      .then((j) => setHistory(j.ok ? asArray<Item>(j.data.items) : []))
      .catch(() => setHistory([]));
  }, []);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ title: "Choose a photo", variant: "amber" });
    try {
      setPreview(await shrink(file));
    } catch {
      toast({ title: "Couldn't read that photo", variant: "destructive" });
    }
  };

  const submit = async () => {
    if (!preview || symptom.trim().length < 4) return;
    setBusy(true);
    try {
      const j = await fetch("/api/studio/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: preview, symptom, setup, parts }),
      }).then((r) => r.json());
      if (j.ok) {
        setResult({ id: j.data.id, symptom, setup, parts, diagnosis: j.data.diagnosis, createdAt: j.data.createdAt });
        loadHistory();
      } else toast({ title: "Couldn't diagnose", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't reach the server", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verified = (shop?.items || []).filter((i) => i.type !== "board");
  const toggle = (t: string) => setParts((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length < 8 ? [...p, t] : p));

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/studio" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to Maker Studio"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <p className="text-xs font-mono tracking-widest text-teal-600">MAKER STUDIO</p>
          <h1 className="text-xl font-extrabold">Debug my circuit</h1>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">Photograph your real breadboard, say what goes wrong, and get ranked causes with a cheap test for each. The AI only reports what it can see and tells you what it can&apos;t.</p>

      <Card className="p-4 space-y-3">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {preview ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Your circuit" className="w-full max-h-72 object-contain rounded-xl bg-slate-100 dark:bg-slate-900" />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4 mr-1" /> Retake / choose another</Button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 py-8 flex flex-col items-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-teal-500">
            <Camera className="h-6 w-6" /> Take or choose a photo
            <span className="text-xs font-normal text-slate-500">Bright light, from above, close enough to see each wire end</span>
          </button>
        )}
        <label className="block text-xs font-semibold">What goes wrong?
          <Textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} maxLength={800} rows={3} placeholder="e.g. The LED never lights when I press the button" className="mt-1" />
        </label>
        <label className="block text-xs font-semibold">How is it wired, and what did you expect? (optional)
          <Textarea value={setup} onChange={(e) => setSetup(e.target.value)} maxLength={800} rows={2} placeholder="e.g. Button on pin 2 with INPUT_PULLUP, LED on 13 through 220 Ω" className="mt-1" />
        </label>
        <div>
          <p className="text-xs font-semibold mb-1">Parts you use (adds their datasheet facts)</p>
          {!shop ? <Skeleton className="h-8 w-full" /> : (
            <div className="flex flex-wrap gap-1.5">
              {verified.map((i) => (
                <button key={i.type} type="button" onClick={() => toggle(i.type)} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold min-h-8", parts.includes(i.type) ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-700")}>
                  {i.name.replace(/ \(.*\)/, "")}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button onClick={submit} disabled={busy || !preview || symptom.trim().length < 4} className="w-full sm:w-auto">
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />} {busy ? "Looking closely…" : "Diagnose"}
        </Button>
      </Card>

      {result && <DiagnosisView item={result} />}

      <div className="space-y-2">
        <h2 className="text-sm font-bold">Past diagnoses</h2>
        {history === null ? <Skeleton className="h-16 w-full" /> : history.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : history.map((h) => <HistoryRow key={h.id} item={h} />)}
      </div>
    </div>
  );
}

function HistoryRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-3">
      <button type="button" className="w-full text-left flex items-center gap-2" onClick={() => setOpen((o) => !o)}>
        <Wrench className="h-4 w-4 text-teal-600 shrink-0" />
        <span className="text-sm font-semibold flex-1 min-w-0 truncate">{item.symptom}</span>
        <span className="text-[11px] text-slate-500 shrink-0">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</span>
      </button>
      {open && <div className="mt-3"><DiagnosisView item={item} bare /></div>}
    </Card>
  );
}

function DiagnosisView({ item, bare }: { item: Item; bare?: boolean }) {
  const d = item.diagnosis;
  const body = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={CONF[d.confidence]}>Confidence: {d.confidence}</Badge>
        <Badge variant="outline">Photo: {d.photoQuality}</Badge>
      </div>
      {(d.photoQuality === "blurry" || d.photoQuality === "unusable") && (
        <p className="rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs px-3 py-2 flex gap-2"><ShieldAlert className="h-4 w-4 shrink-0" /> This photo is too hard to read, so treat these as guesses to check, not conclusions.</p>
      )}
      {d.seen.length > 0 && (
        <div>
          <p className="text-xs font-bold mb-1">What I can see</p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">{d.seen.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {d.causes.map((c, i) => (
        <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
          <p className="text-sm font-bold"><span className="text-teal-600 mr-1">#{i + 1}</span>{c.title} <span className="text-[11px] font-normal text-slate-500">· {c.likelihood} likelihood · {EVIDENCE[c.evidence]}</span></p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{c.why}</p>
          <div className="text-xs rounded-lg bg-slate-50 dark:bg-slate-900 p-2">
            <p className="font-semibold">Test with: {c.test.tool}</p>
            <ol className="list-decimal pl-5">{c.test.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
            {c.test.expect && <p className="mt-1"><b>If it is this:</b> {c.test.expect}</p>}
          </div>
          {c.fix && <p className="text-xs"><b>Fix:</b> {c.fix}</p>}
        </div>
      ))}
      {d.testSketch && (
        <div>
          <p className="text-xs font-bold mb-1">Tiny test sketch</p>
          <pre className="text-[11px] rounded-lg bg-slate-900 text-slate-100 p-3 overflow-x-auto">{d.testSketch}</pre>
        </div>
      )}
      {d.cannotSee.length > 0 && (
        <div>
          <p className="text-xs font-bold mb-1">What I couldn&apos;t see</p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">{d.cannotSee.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {d.nextSteps.length > 0 && (
        <div>
          <p className="text-xs font-bold mb-1">Next</p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">{d.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  );
  return bare ? body : <Card className="p-4">{body}</Card>;
}
