"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Download, FileText, Loader2, Plus, PlayCircle, Printer, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { TeachPanel } from "@/components/teach/teach-panel";
import { NoteFlashcards, NoteQuiz } from "@/components/study/note-practice";
import { UsageStrip } from "@/components/billing/usage-strip";
import { ImageFinder } from "@/components/study/image-finder";
import { extractTextFromFile } from "@/lib/pdf/extractor";
import { fetchJson, asArray } from "@/lib/api/client";
import { REFINE_PRESETS, linkCitations } from "@/lib/study/notes";
import { cn } from "@/lib/utils";

interface NoteRow {
  id: string;
  title: string;
  sourceTitle: string;
  updatedAt: string;
}
interface NoteView {
  id: string;
  title: string;
  sourceTitle: string;
  hasPages: boolean;
  head: number;
  shown: number;
  markdown: string;
  versions: Array<{ n: number; instruction: string; createdAt: string }>;
}

export default function StudyNotesPage() {
  const { toast } = useToast();
  const [list, setList] = useState<NoteRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<NoteView | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [reading, setReading] = useState("");
  const [busy, setBusy] = useState("");
  const [custom, setCustom] = useState("");
  const [page, setPage] = useState<{ n: number; text: string } | null>(null);
  const [mode, setMode] = useState<"notes" | "teach" | "cards" | "quiz" | "pictures">("notes");
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    const j = await fetchJson<{ notes: NoteRow[] }>("/api/study/notes");
    setList(j.ok ? asArray<NoteRow>(j.data.notes) : []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void loadList(), 0);
    return () => clearTimeout(t);
  }, [loadList]);

  const open = useCallback(
    async (id: string, version?: number) => {
      setOpenId(id);
      setPage(null);
      if (!version) setMode((m) => (m === "teach" ? "notes" : m));
      const j = await fetchJson<NoteView>(`/api/study/notes/${id}${version ? `?version=${version}` : ""}`);
      if (j.ok) setView(j.data);
      else toast({ title: "Couldn't open these notes", description: j.error.message, variant: "destructive" });
    },
    [toast]
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading("Reading your file…");
    try {
      const got = await extractTextFromFile(file, (m) => setReading(m));
      setText((prev) => (prev ? `${prev}\n\n${got}` : got));
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
    } catch (err) {
      toast({ title: "Couldn't read that file", description: err instanceof Error ? err.message : "Try another file.", variant: "destructive" });
    } finally {
      setReading("");
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  };

  const make = async () => {
    setBusy("make");
    const j = await fetchJson<{ id: string }>("/api/study/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, text }) });
    setBusy("");
    if (!j.ok) return toast({ title: "Couldn't make the notes", description: j.error.message, variant: "destructive" });
    setCreating(false);
    setTitle("");
    setText("");
    void loadList();
    void open(j.data.id);
  };

  const refine = async (body: { preset?: string; instruction?: string }) => {
    if (!view) return;
    setBusy(body.preset || "custom");
    const j = await fetchJson<{ head: number }>(`/api/study/notes/${view.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy("");
    if (!j.ok) return toast({ title: "Couldn't change the notes", description: j.error.message, variant: "destructive" });
    setCustom("");
    void open(view.id);
    void loadList();
  };

  const restore = async (n: number) => {
    if (!view) return;
    setBusy("restore");
    const j = await fetchJson(`/api/study/notes/${view.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: n }) });
    setBusy("");
    if (j.ok) void open(view.id);
  };

  const remove = async () => {
    if (!view || !window.confirm("Delete these notes and all their versions?")) return;
    await fetchJson(`/api/study/notes/${view.id}`, { method: "DELETE" });
    setView(null);
    setOpenId(null);
    void loadList();
  };

  const showPage = async (n: number) => {
    if (!view) return;
    const j = await fetchJson<{ text: string }>(`/api/study/notes/${view.id}?page=${n}`);
    setPage({ n, text: j.ok && j.data.text ? j.data.text : "That page isn't available in your source." });
  };

  const download = () => {
    if (!view) return;
    const blob = new Blob([view.markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${view.title.replace(/[^\w-]+/g, "-").toLowerCase() || "notes"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onNotesClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href") || "";
    if (href.startsWith("#src-")) {
      e.preventDefault();
      void showPage(Number(href.slice(5)));
    }
  };

  const latest = view ? view.shown === view.head : true;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-mono tracking-widest text-teal-600">STUDY NOTES</p>
        <h1 className="text-2xl font-extrabold">Notes that make sense</h1>
        <p className="text-sm text-slate-500 max-w-2xl">Upload a PDF, photograph your notes or paste text. Sunroot reads it, even handwriting, and writes clean notes with topics, worked examples and questions to check yourself. Ask for changes any time.</p>
      </div>

      <UsageStrip features={[{ key: "notes", label: "notes sets" }, { key: "scan_pages", label: "scanned pages" }, { key: "lessons", label: "lessons" }]} />

      {!openId && !creating && (
        <div className="space-y-3">
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> New notes</Button>
          {list === null ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : list.length === 0 ? (
            <Card className="p-6 text-sm text-slate-500">No notes yet. Make your first set from a PDF, a photo of a page, or pasted text.</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((n) => (
                <button key={n.id} onClick={() => open(n.id)} className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:border-teal-500">
                  <p className="font-bold flex items-center gap-2"><FileText className="h-4 w-4 text-teal-600" /> {n.title}</p>
                  <p className="text-xs text-slate-500 mt-1">From {n.sourceTitle || "your source"}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {creating && (
        <Card className="p-4 md:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <p className="font-bold flex-1">Make new notes</p>
            <button onClick={() => setCreating(false)} aria-label="Close" className="p-1"><X className="h-4 w-4" /></button>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={120} className="w-full h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm" />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="outline" size="sm" disabled={!!reading} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> PDF or photo</Button>
            <Button variant="outline" size="sm" disabled={!!reading} onClick={() => camRef.current?.click()}><Camera className="h-4 w-4 mr-1" /> Take a photo</Button>
          </div>
          {reading && <p className="text-xs text-teal-600 font-semibold animate-pulse">{reading}</p>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="…or paste your notes or lecture text here. A scanned PDF or a photo is read for you." className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent p-3 text-sm" />
          <div className="flex items-center gap-2">
            <Button disabled={busy === "make" || !!reading || text.trim().length < 40} onClick={make}>
              {busy === "make" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Make my notes
            </Button>
            {text.trim().length > 0 && text.trim().length < 40 && <span className="text-xs text-slate-500">Add a little more text.</span>}
          </div>
        </Card>
      )}

      {openId && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => { setOpenId(null); setView(null); setPage(null); }}>← All notes</Button>
            <div className="flex-1" />
            {view && (
              <>
                <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4 mr-1" /> Download</Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                <Button variant="ghost" size="sm" onClick={remove} aria-label="Delete notes"><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
          {!view ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-4 items-start">
              <div className="lg:col-span-3 space-y-3 min-w-0">
                {!latest && (
                  <Card className="p-3 flex flex-wrap items-center gap-2 text-xs border-amber-500/40 bg-amber-500/5">
                    <span className="flex-1">You are looking at version {view.shown}, not the newest.</span>
                    <Button size="sm" disabled={busy === "restore"} onClick={() => restore(view.shown)}>Make this the current version</Button>
                    <Button size="sm" variant="outline" onClick={() => open(view.id)}>Back to newest</Button>
                  </Card>
                )}
                <div className="flex flex-wrap gap-1.5 print:hidden" role="tablist" aria-label="Ways to study these notes">
                  {([["notes", "Notes"], ["teach", "Teach me"], ["cards", "Flashcards"], ["quiz", "Quiz me"], ["pictures", "Pictures"]] as const).map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cn("rounded-full px-4 py-1.5 text-xs font-bold", mode === k ? "bg-teal-600 text-white" : "border border-slate-300 dark:border-slate-700 hover:border-teal-500")}>
                      {k === "teach" && <PlayCircle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}{label}
                    </button>
                  ))}
                </div>
                {mode === "teach" && <TeachPanel key={`${view.id}-${view.head}`} source={{ type: "note", id: view.id }} canRegenerate finish={{ label: "Quiz me on these notes →", onClick: () => setMode("quiz") }} />}
                {mode === "cards" && <NoteFlashcards key={view.id} noteId={view.id} />}
                {mode === "quiz" && <NoteQuiz key={view.id} noteId={view.id} />}
                {mode === "pictures" && <ImageFinder key={view.id} initialQuery={view.title} />}
                {mode === "notes" && (
                  <Card className="p-4 md:p-6" onClick={onNotesClick}>
                    <MarkdownRenderer content={linkCitations(view.markdown)} />
                  </Card>
                )}
                {page && (
                  <Card className="p-4 space-y-2 print:hidden">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm flex-1">From your source, page {page.n}</p>
                      <button onClick={() => setPage(null)} aria-label="Close" className="p-1"><X className="h-4 w-4" /></button>
                    </div>
                    <p className="text-xs whitespace-pre-wrap text-slate-600 dark:text-slate-300 max-h-64 overflow-y-auto">{page.text}</p>
                  </Card>
                )}
              </div>
              <div className="space-y-3 print:hidden">
                <Card className="p-3 space-y-2">
                  <p className="font-bold text-sm">Change the notes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REFINE_PRESETS.map((p) => (
                      <button key={p.id} disabled={!!busy || !latest} onClick={() => refine({ preset: p.id })} className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs font-semibold hover:border-teal-500 disabled:opacity-50">
                        {busy === p.id ? "Working…" : p.label}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void refine({ instruction: custom.trim() }); }} className="flex gap-1.5">
                    <input value={custom} onChange={(e) => setCustom(e.target.value)} disabled={!!busy || !latest} maxLength={500} placeholder="e.g. explain in Pidgin" className="flex-1 min-w-0 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-xs" />
                    <Button size="sm" disabled={!!busy || !latest || !custom.trim()}>{busy === "custom" ? "…" : "Go"}</Button>
                  </form>
                </Card>
                <Card className="p-3 space-y-2">
                  <p className="font-bold text-sm">Versions</p>
                  <ul className="space-y-1">
                    {view.versions.map((v) => (
                      <li key={v.n}>
                        <button onClick={() => open(view.id, v.n)} className={cn("w-full text-left text-xs rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-900", v.n === view.shown && "bg-teal-500/10 font-semibold")}>
                          <span className="font-mono text-slate-400 mr-1">v{v.n}</span>{v.instruction}{v.n === view.head ? " (newest)" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
