"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, Trash2, Lightbulb, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ExplainLevelToggle, useExplainLevel } from "@/components/study/explain-level-toggle";
import { compressImage } from "@/lib/image-compress";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Snap {
  id: string;
  title: string;
  text: string;
  guided: boolean;
  createdAt: string;
}

async function prepareImage(file: File): Promise<string> {
  let dataUrl = await compressImage(file);
  for (const [side, q] of [[1400, 0.75], [1200, 0.68], [1000, 0.6]] as const) {
    if (dataUrl.length <= 900_000) break;
    dataUrl = await compressImage(file, side, q);
  }
  return dataUrl;
}

export default function SnapPage() {
  const { toast } = useToast();
  const [level, setLevel] = useExplainLevel();
  const [guided, setGuided] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Snap | null>(null);
  const [history, setHistory] = useState<Snap[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/snap")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok) setHistory(asArray<Snap>(j.data));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose a photo", variant: "destructive" });
      return;
    }
    try {
      setResult(null);
      setPreview(await prepareImage(file));
    } catch {
      toast({ title: "Couldn't read that image", variant: "destructive" });
    }
  };

  const submit = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: preview, guided, note: note.trim() || undefined, level }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error?.message || "Something went wrong. Please try again.");
      const snap = j.data as Snap;
      setResult(snap);
      setHistory((h) => [snap, ...h]);
      setPreview(null); // the image is not kept once it has been read
      setNote("");
    } catch (e) {
      toast({ title: "Couldn't explain that", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setHistory((h) => h.filter((s) => s.id !== id));
    if (result?.id === id) setResult(null);
    fetch(`/api/snap?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Snap your homework</h1>
        <p className="text-sm text-slate-500">Photograph a problem and get it explained step by step. Photos are never saved.</p>
      </div>

      <Card className="p-4 space-y-4">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />

        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Your problem" className="w-full max-h-80 object-contain rounded-xl bg-slate-100 dark:bg-slate-800" />
            <button type="button" onClick={() => setPreview(null)} aria-label="Remove photo" className="absolute top-2 right-2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => cameraRef.current?.click()} className="h-28 rounded-2xl border-2 border-dashed border-teal-500/50 bg-teal-500/5 flex flex-col items-center justify-center gap-1.5 text-teal-700 dark:text-teal-300 font-semibold text-sm">
              <Camera className="h-6 w-6" /> Take a photo
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} className="h-28 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold text-sm">
              <ImageIcon className="h-6 w-6" /> Upload image
            </button>
          </div>
        )}

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 cursor-pointer">
          <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} className="h-5 w-5 accent-teal-600" />
          <span className="text-sm">
            <span className="font-semibold flex items-center gap-1"><Lightbulb className="h-4 w-4 text-amber-500" /> Guide me, don&apos;t tell me</span>
            <span className="text-xs text-slate-500">Hints and questions instead of the answer.</span>
          </span>
        </label>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500">Explain at</span>
          <ExplainLevelToggle value={level} onChange={setLevel} />
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Optional: what are you stuck on?"
          className="h-11 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />

        <Button onClick={submit} disabled={!preview || busy} className="w-full" size="lg">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Reading your problem…</> : guided ? "Give me hints" : "Explain it"}
        </Button>
      </Card>

      {result && (
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-teal-600 mb-1">{result.guided ? "Hints" : "Explanation"}</div>
          <MarkdownRenderer content={result.text} />
        </Card>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Past snaps</h2>
          {history.map((s) => (
            <details key={s.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 group">
              <summary className="flex items-center gap-2 p-3 cursor-pointer list-none">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{s.title}</div>
                  <div className="text-[11px] text-slate-500">{s.createdAt ? new Date(s.createdAt).toLocaleString() : ""}{s.guided ? " · hints" : ""}</div>
                </div>
                <button type="button" aria-label="Delete" onClick={(e) => { e.preventDefault(); remove(s.id); }} className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </summary>
              <div className="px-3 pb-3 border-t border-slate-100 dark:border-slate-800 pt-2">
                <MarkdownRenderer content={s.text} />
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
