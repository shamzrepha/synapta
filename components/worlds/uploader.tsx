"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, FileText, Image as ImageIcon, Loader2, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { compressImage } from "@/lib/image-compress";
import { extractTextFromFile } from "@/lib/pdf/extractor";
import { asArray } from "@/lib/api/client";
import { useBuild } from "./use-build";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
  kind: "docx" | "pdf" | "image" | "text";
  /** pages of text, or photos, ready to send */
  pageTexts?: string[];
  images?: Array<{ mime: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string }>;
  state: "ready" | "sending" | "sent" | "error";
  message?: string;
  docId?: string;
  flagged?: Array<{ pageNo: number; lineNo: number; text: string; reason: string }>;
}

interface LibRow {
  id: string;
  title: string;
  pages: number;
  chars: number;
  problem: string | null;
  docId: string | null;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const isImg = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name);

async function post<T>(url: string, body: unknown, method = "POST"): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: j.error?.message || "Something went wrong." };
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
}

/**
 * Add notes (PDF, Word, slides, photos, pasted text, one or many), press Create. The AI reads them, cleans them, pulls
 * out the key facts and merges everything with what is already in the library. The same screen adds more notes later.
 */
export function WorldUploader({ worldId, classId }: { worldId?: string; classId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [phase, setPhase] = useState<"add" | "check" | "build">("add");
  const [target, setTarget] = useState<string | undefined>(worldId);
  // the class's subject library: the notes are already there, so nobody uploads them again
  const [libClass, setLibClass] = useState<string | undefined>(classId);
  const [library, setLibrary] = useState<LibRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const { progress, run } = useBuild(() => {
    if (target) router.replace(`/worlds/${target}`);
  });

  useEffect(() => {
    if (libClass || !worldId) return;
    let off = false;
    fetch(`/api/worlds/${worldId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!off && j.ok && j.data?.world?.classId) setLibClass(j.data.world.classId);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [libClass, worldId]);

  useEffect(() => {
    if (!libClass) return;
    let off = false;
    fetch(`/api/worlds/from-library?classId=${encodeURIComponent(libClass)}`)
      .then((r) => r.json())
      .then((j) => {
        if (off) return;
        const rows = j.ok ? asArray<LibRow>(j.data.materials) : [];
        setLibrary(rows);
        setPicked(new Set(rows.filter((r) => !r.problem).map((r) => r.id)));
      })
      .catch(() => !off && setLibrary([]));
    return () => {
      off = true;
    };
  }, [libClass]);

  const importFromLibrary = async () => {
    if (!libClass || picked.size === 0) return;
    setPhase("check");
    setReading("your subject library");
    const r = await post<{ docs: Array<{ materialId: string; docId: string; title: string; flagged: Item["flagged"] }>; skipped: Array<{ title: string; reason: string }> }>("/api/worlds/from-library", { classId: libClass, materialIds: [...picked] });
    setReading(null);
    if (!r.ok) {
      toast({ title: "Couldn't read those notes", description: r.message, variant: "destructive" });
      return setPhase("add");
    }
    for (const sk of r.data.skipped) toast({ title: `Skipped ${sk.title}`, description: sk.reason, variant: "amber" });
    const list: Item[] = r.data.docs.map((d) => ({ id: d.materialId, name: d.title, kind: "text", state: "sent", docId: d.docId, flagged: asArray(d.flagged) }));
    setItems(list);
    // nothing unclear: go straight on
    if (!list.some((i) => (i.flagged?.length ?? 0) > 0)) void create(list);
  };

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const f of Array.from(files)) {
        const id = uid();
        try {
          setReading(f.name);
          if (isImg(f)) {
            const dataUrl = await compressImage(f, 1800, 0.85);
            const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
            if (!m) throw new Error("This photo format isn't supported. Try a JPG or PNG.");
            setItems((x) => [...x, { id, name: f.name, kind: "image", images: [{ mime: m[1] as "image/jpeg", dataBase64: m[2] }], state: "ready" }]);
          } else {
            const text = await extractTextFromFile(f);
            if (text.trim().length < 20) throw new Error("No readable text found. If this is a scan, upload photos of the pages instead.");
            const kind = /\.pdf$/i.test(f.name) ? "pdf" : /\.(docx|pptx)$/i.test(f.name) ? "docx" : "text";
            setItems((x) => [...x, { id, name: f.name, kind, pageTexts: [text], state: "ready" }]);
          }
        } catch (e) {
          setItems((x) => [...x, { id, name: f.name, kind: "text", state: "error", message: (e as Error).message }]);
        }
      }
      setReading(null);
    },
    []
  );

  // several photos of one notebook belong to one note, in the order they were added
  const merged = (): Item[] => {
    const photos = items.filter((i) => i.kind === "image" && i.state !== "error");
    const rest = items.filter((i) => i.kind !== "image" && i.state !== "error");
    const out = [...rest];
    if (photos.length) out.push({ id: "photos", name: photos.length === 1 ? photos[0].name : `${photos.length} photos of notes`, kind: "image", images: photos.flatMap((p) => p.images ?? []), state: "ready" });
    if (pasted.trim().length >= 20) out.push({ id: "pasted", name: "Pasted notes", kind: "text", pageTexts: [pasted], state: "ready" });
    return out;
  };

  const upload = async () => {
    const list = merged();
    if (list.length === 0) return toast({ title: "Add some notes first", variant: "amber" });
    setPhase("check");
    const sent: Item[] = [];
    for (const it of list) {
      setReading(`Reading ${it.name}…`);
      const r = await post<{ docId: string; flagged: Item["flagged"] }>("/api/worlds/docs", { title: it.name.replace(/\.[^.]+$/, ""), kind: it.kind, pageTexts: it.pageTexts, images: it.images, classId });
      if (!r.ok) {
        toast({ title: `Couldn't read ${it.name}`, description: r.message, variant: "destructive" });
        sent.push({ ...it, state: "error", message: r.message });
        continue;
      }
      sent.push({ ...it, state: "sent", docId: r.data.docId, flagged: asArray(r.data.flagged) });
    }
    setReading(null);
    setItems(sent);
    if (!sent.some((s) => s.state === "sent")) return setPhase("add");
    // nothing unclear: go straight on
    if (!sent.some((s) => (s.flagged?.length ?? 0) > 0)) void create(sent);
  };

  const create = async (list: Item[] = items) => {
    const docIds = list.filter((i) => i.docId).map((i) => i.docId!);
    setPhase("build");
    const r = await post<{ worldId: string; jobId: string }>("/api/worlds", { docIds, worldId: target, classId, title: list[0]?.name.replace(/\.[^.]+$/, "") });
    if (!r.ok) {
      toast({ title: "Couldn't start", description: r.message, variant: "destructive" });
      return setPhase("add");
    }
    setTarget(r.data.worldId);
    void run(r.data.jobId);
  };

  const confirmLine = async (item: Item, line: { pageNo: number; lineNo: number }, text?: string) => {
    if (!item.docId) return;
    await post(`/api/worlds/docs/${item.docId}`, { edits: [{ ...line, text }] }, "PATCH");
    setItems((x) => x.map((i) => (i.id === item.id ? { ...i, flagged: asArray<NonNullable<Item["flagged"]>[number]>(i.flagged).filter((f) => !(f.pageNo === line.pageNo && f.lineNo === line.lineNo)) } : i)));
  };

  const pending = items.reduce((n, i) => n + (i.flagged?.length ?? 0), 0);

  if (phase === "build") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 5;
    return (
      <Card className="p-6 space-y-4 max-w-xl mx-auto" role="status" aria-live="polite">
        <h2 className="font-bold text-lg flex items-center gap-2">
          {progress.status === "done" ? <CheckCircle2 className="h-5 w-5 text-teal-600" /> : <Loader2 className="h-5 w-5 animate-spin" />} {progress.status === "error" ? "Something stopped" : progress.stageLabel}
        </h2>
        <div className="h-3 rounded-full bg-muted overflow-hidden"><div className="h-full bg-brand-600 transition-[width] duration-500" style={{ width: `${progress.status === "done" ? 100 : pct}%` }} /></div>
        <p className="text-sm text-muted-foreground">
          {progress.status === "error" ? progress.error : `${progress.done} of ${progress.total || "…"} sections read. You can leave this page: your progress is saved and it carries on when you come back.`}
        </p>
        {progress.skipped > 0 && <p className="text-xs text-amber-600">{progress.skipped} section(s) couldn&apos;t be read yet. The rest is being built.</p>}
        {progress.status === "error" && <Button onClick={() => (target ? router.replace(`/worlds/${target}`) : setPhase("add"))}>Open my library</Button>}
      </Card>
    );
  }

  if (phase === "check" && pending > 0) {
    return (
      <Card className="p-6 space-y-4 max-w-2xl mx-auto">
        <div>
          <h2 className="font-bold text-lg">A few lines are hard to read</h2>
          <p className="text-sm text-muted-foreground">Nothing is changed without you. Tap &quot;That&apos;s right&quot; or fix the text.</p>
        </div>
        {items.map((it) => asArray<NonNullable<Item["flagged"]>[number]>(it.flagged).slice(0, 25).map((f) => (
          <FlaggedLine key={`${it.id}-${f.pageNo}-${f.lineNo}`} f={f} note={it.name} onConfirm={(t) => confirmLine(it, f, t)} />
        )))}
        <div className="flex gap-2 pt-2">
          <Button onClick={() => create()} className="flex-1">{pending > 0 ? "Looks good, build my world" : "Build my world"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Unconfirmed lines are still used but marked low confidence in your library.</p>
      </Card>
    );
  }

  const usable = library?.filter((r) => !r.problem) ?? [];
  const hasLibrary = !!libClass && library !== null && library.length > 0;
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {libClass && library === null && <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening your subject library…</p>}
      {hasLibrary && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-600" />
            <div className="flex-1 min-w-0">
              <p className="font-bold">From your subject library</p>
              <p className="text-xs text-muted-foreground">These notes are already uploaded. Pick the ones for this world: nothing to upload again.</p>
            </div>
            {usable.length > 1 && (
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setPicked(picked.size === usable.length ? new Set() : new Set(usable.map((r) => r.id)))}>
                {picked.size === usable.length ? "Clear" : "Select all"}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {library!.map((r) => (
              <label key={r.id} className={cn("flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-sm", r.problem ? "opacity-60" : "cursor-pointer hover:border-brand-500/60")}>
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!!r.problem}
                  checked={picked.has(r.id)}
                  onChange={(e) =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (e.target.checked) n.add(r.id);
                      else n.delete(r.id);
                      return n;
                    })
                  }
                />
                <span className="flex-1 min-w-0">
                  <span className="font-medium block truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground">{r.problem ? r.problem : `${r.pages} page${r.pages === 1 ? "" : "s"}, ${Math.max(1, Math.round(r.chars / 1000))}k characters${r.docId ? ", already read before" : ""}`}</span>
                </span>
              </label>
            ))}
          </div>
          <Button size="lg" className="w-full" onClick={importFromLibrary} disabled={picked.size === 0 || reading !== null} isLoading={phase === "check"}>
            <Sparkles className="h-4 w-4 mr-2" /> {target ? `Add ${picked.size} note${picked.size === 1 ? "" : "s"} to this world` : `Build my world from ${picked.size} note${picked.size === 1 ? "" : "s"}`}
          </Button>
        </Card>
      )}
      {libClass && library !== null && library.length === 0 && (
        <p className="text-xs text-muted-foreground text-center">Your subject library has no notes yet. Add them in the class Materials, or upload them here.</p>
      )}
      {hasLibrary && <p className="text-xs text-muted-foreground text-center">Have other notes too? Add them below.</p>}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }}
        className="rounded-xl border-2 border-dashed border-border bg-card p-8 text-center space-y-3"
      >
        <UploadCloud className="h-8 w-8 mx-auto text-brand-600" />
        <p className="font-semibold">Drop notes, photos or a PDF here</p>
        <p className="text-sm text-muted-foreground">PDF, Word, slides, text, or photos of handwritten pages. Add as many as you like, even on the same topic: they get merged.</p>
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md,.json,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown,text/csv,application/json" className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} aria-label="Choose files" />
        <input ref={photoRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} aria-label="Choose photos" />
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>Choose files</Button>
          <Button variant="outline" onClick={() => photoRef.current?.click()}>Photos</Button>
        </div>
        {reading && <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading {reading}…</p>}
      </div>

      {items.length > 0 && (
        <Card className="p-3 space-y-1.5">
          {items.map((i) => (
            <div key={i.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm", i.state === "error" && "bg-rose-500/10")}>
              {i.kind === "image" ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
              <span className="flex-1 min-w-0 truncate">{i.name}</span>
              {i.state === "error" && <span className="text-xs text-rose-600 truncate max-w-[50%]">{i.message}</span>}
              <button type="button" aria-label={`Remove ${i.name}`} onClick={() => setItems((x) => x.filter((y) => y.id !== i.id))} className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </Card>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Or paste text</summary>
        <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste your notes here" className="mt-2 min-h-32" aria-label="Pasted notes" />
      </details>

      <Button size="lg" className="w-full" onClick={upload} disabled={reading !== null || (items.every((i) => i.state === "error") && pasted.trim().length < 20)} isLoading={phase === "check"}>
        <Sparkles className="h-4 w-4 mr-2" /> Create
      </Button>
      <p className="text-xs text-muted-foreground text-center">Your notes stay the source of truth. The AI never changes them: it flags anything unclear and asks you.</p>
    </div>
  );
}

function FlaggedLine({ f, note, onConfirm }: { f: { pageNo: number; lineNo: number; text: string; reason: string }; note: string; onConfirm: (text?: string) => void }) {
  const [text, setText] = useState(f.text);
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">{note}, page {f.pageNo}: {f.reason}</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-14 text-sm" aria-label="Line text" />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onConfirm(text !== f.text ? text : undefined)}>{text !== f.text ? "Save my fix" : "That's right"}</Button>
      </div>
    </div>
  );
}
