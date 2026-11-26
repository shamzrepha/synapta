"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, FileText, Trash2, Upload, BookOpen, ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { DOWNLOADS_CACHE, ITEMS_KEY, parseItems, upsertItem } from "@/lib/offline/items";

interface Chapter {
  chapterNumber: number;
  title: string;
  startPage: number;
  endPage: number;
  pageCount: number;
  courseCode?: string | null;
}

interface LFile {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  pages: number | null;
  kind: string;
  level: number | null;
  courseCode: string | null;
  readPolicy: string;
  uploaderName: string;
  chapters?: Chapter[];
}

interface Data {
  mode: "student" | "rep" | "admin";
  files: LFile[];
  rep: { institution: string; department: string } | null;
}

const KIND: Record<string, string> = {
  textbook: "Textbook",
  lecture_note: "Lecture note",
  slides: "Slides",
  past_question: "Past questions",
  other: "Other",
};

const mb = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;

const sel = "h-10 rounded-lg border border-border bg-background px-2 text-xs";

/** Your department's shared library. A student reads it; a course rep adds to it. Files can be saved to open with no data. */
export function DepartmentLibrary() {
  const { toast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/library/files")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setData({ ...j.data, files: asArray<LFile>(j.data.files) });
        try {
          setSaved(new Set(parseItems(localStorage.getItem(ITEMS_KEY)).map((i) => i.url)));
        } catch {
          /* private mode */
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let ok = 0;
    const fileList = Array.from(files);

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      setStatusMsg(`Uploading and indexing ${f.name} (${i + 1}/${fileList.length})…`);
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch("/api/library/upload", { method: "POST", body: fd });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.ok) {
          ok++;
          if (j.data?.chapters?.length) {
            toast({
              title: `${f.name} indexed`,
              description: `Indexed into ${j.data.chapters.length} chapters for single-chapter study.`,
              variant: "success",
            });
          }
        } else {
          toast({
            title: `Couldn't add ${f.name}`,
            description: j?.error?.message || "Try again.",
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: `Couldn't add ${f.name}`,
          description: "Check your connection.",
          variant: "destructive",
        });
      }
    }
    setBusy(false);
    setStatusMsg(null);
    if (input.current) input.current.value = "";
    if (ok) {
      toast({
        title: `${ok} file${ok === 1 ? "" : "s"} added`,
        description: "Sunroot indexed chapters where appropriate. Check details below.",
        variant: "success",
      });
    }
    load();
  };

  const edit = async (id: string, patch: { kind?: string; level?: number | null }) => {
    const res = await fetch(`/api/library/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return toast({ title: "Couldn't save that", variant: "destructive" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this file from the library?")) return;
    await fetch(`/api/library/files/${id}`, { method: "DELETE" });
    load();
  };

  const keep = async (f: LFile) => {
    const url = `/api/library/files/${f.id}/file`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch");
      const cache = await caches.open(DOWNLOADS_CACHE);
      await cache.put(url, res.clone());
      const items = upsertItem(parseItems(localStorage.getItem(ITEMS_KEY)), {
        url,
        page: "/study/library",
        title: f.title,
        bytes: f.sizeBytes,
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
      setSaved((s) => new Set(s).add(url));
      toast({
        title: "Saved for offline",
        description: "It will open even with no data.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Couldn't save it",
        description: "Try again when your connection is better.",
        variant: "destructive",
      });
    }
  };

  if (!data) return null;
  const canEdit = data.mode === "rep" || data.mode === "admin";
  if (data.files.length === 0 && !canEdit) return null;

  return (
    <section aria-label="Department library" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-brand-600 dark:text-brand-300" />{" "}
          {data.rep ? `${data.rep.department} library` : "Your department's library"}
        </h2>
        {canEdit && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
              className="sr-only"
              onChange={(e) => void upload(e.target.files)}
            />
            <Button size="sm" isLoading={busy} onClick={() => input.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> Add files
            </Button>
          </>
        )}
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-3 text-xs font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-300 border border-brand-200 dark:border-brand-900">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Add any PDF, Word or PowerPoint file your department has (up to 25 MB each). Large textbooks (150+ pages) are indexed into chapters so students can download or view one chapter at a time without burning data.
        </p>
      )}

      {data.files.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">Nothing here yet.</Card>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.files.map((f) => {
          const url = `/api/library/files/${f.id}/file`;
          const hasChapters = Boolean(f.chapters && f.chapters.length > 0);
          const isExpanded = expandedFiles.has(f.id);

          return (
            <li key={f.id} className="space-y-2 p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {f.title}
                    </a>
                    {f.readPolicy === "index_only" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                        Indexed Book
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {KIND[f.kind] ?? "File"}
                    {f.courseCode ? ` · ${f.courseCode}` : ""}
                    {f.level ? ` · ${f.level} level` : ""} ·{" "}
                    {f.pages ? `${f.pages} pages · ` : ""}
                    {mb(f.sizeBytes)}
                  </p>
                </div>

                {hasChapters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleExpand(f.id)}
                    className="shrink-0 text-xs h-8 px-2.5 gap-1"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Chapters ({f.chapters!.length})
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    )}
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() => void keep(f)}
                  disabled={saved.has(url)}
                  aria-label={saved.has(url) ? "Saved for offline" : "Save for offline"}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/60 disabled:text-emerald-600"
                >
                  <CloudDownload className="h-4 w-4" />
                </button>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void remove(f.id)}
                    aria-label="Remove"
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Collapsible Chapters List */}
              {hasChapters && isExpanded && (
                <div className="mt-2 rounded-lg border border-border/80 bg-slate-50/50 dark:bg-slate-900/40 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 pb-1 border-b border-border/60">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                      Chapters ({f.chapters!.length})
                    </span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      Open or save one chapter at a time
                    </span>
                  </div>
                  <ul className="divide-y divide-border/40 text-xs">
                    {f.chapters!.map((ch) => (
                      <li
                        key={ch.chapterNumber}
                        className="py-1.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {ch.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Pages {ch.startPage}–{ch.endPage} ({ch.pageCount} pages)
                            {ch.courseCode ? ` · ${ch.courseCode}` : ""}
                          </p>
                        </div>
                        <a
                          href={`/api/library/files/${f.id}/chapters/${ch.chapterNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-brand-600 dark:text-brand-400 hover:underline font-semibold text-[11px] px-2 py-0.5 rounded hover:bg-brand-50 dark:hover:bg-brand-950/40"
                        >
                          Open Chapter
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canEdit && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <select
                    className={sel}
                    value={f.kind}
                    onChange={(e) => void edit(f.id, { kind: e.target.value })}
                    aria-label="Type"
                  >
                    {Object.entries(KIND).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    className={sel}
                    value={f.level ?? ""}
                    onChange={(e) =>
                      void edit(f.id, {
                        level: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    aria-label="Level"
                  >
                    <option value="">Any level</option>
                    {[100, 200, 300, 400, 500, 600].map((l) => (
                      <option key={l} value={l}>
                        {l} level
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
