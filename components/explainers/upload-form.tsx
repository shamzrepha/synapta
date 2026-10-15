"use client";

import React, { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { MAX_BYTES, MAX_SECONDS, validateUpload } from "@/lib/explainers/rules";

/** Reads a video's length in the browser using a hidden <video> element. */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (n: number) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(n);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
    v.src = url;
  });
}

export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (f: File | null) => {
    setFile(null);
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setError("Video is too large (25 MB max).");
    const d = await readDuration(f);
    if (d <= 0) return setError("Couldn't read this video. Try an MP4, MOV or WebM file.");
    if (d > MAX_SECONDS + 0.5) return setError(`That video is ${Math.round(d)} seconds. Explainers can be at most 60 seconds.`);
    setFile(f);
    setDuration(d);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const problem = validateUpload({ bytes: file.size, durationSec: duration, title });
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", title.trim());
      fd.set("tags", tags);
      fd.set("durationSec", String(duration));
      const j = await fetch("/api/explainers", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error?.message || "Upload failed");
      toast({ title: "Explainer posted 🎬", variant: "success" });
      setFile(null);
      setTitle("");
      setTags("");
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className="text-sm font-bold">Explain a concept in under 60 seconds</p>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
        <Upload className="h-4 w-4" />
        <span className="truncate">{file ? `${file.name} · ${Math.round(duration)}s` : "Choose a video (MP4, MOV, WebM, up to 25 MB)"}</span>
        <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => pick(e.target.files?.[0] || null)} />
      </label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Why the sky is blue" maxLength={100} />
      <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags: physics light (up to 5)" />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" size="sm" isLoading={busy} disabled={!file || !title.trim()}>
        Post explainer
      </Button>
    </form>
  );
}
