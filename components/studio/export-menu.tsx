"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileText, FileJson, Box, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fileSlug, readmeMarkdown } from "@/lib/studio/guide";
import { sceneParts } from "@/lib/studio/circuit/to3d";
import type { DesignSpec } from "@/lib/studio/spec";

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Export menu for the editor header: STL, printable guide, JSON spec, Markdown readme. */
export function ExportMenu({ designId, title, author, spec }: { designId: string; title: string; author: string; spec: DesignSpec }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const slug = fileSlug(title);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const stl = async () => {
    setOpen(false);
    try {
      const parts = sceneParts(spec);
      if (!parts.length) return toast({ title: "Nothing to export", description: "This design has no 3D parts yet.", variant: "destructive" });
      const { buildStl } = await import("@/components/studio/export-stl");
      const { data, triangles } = buildStl(parts);
      download(`${slug}.stl`, data, "model/stl");
      toast({ title: "STL exported", description: `${triangles.toLocaleString()} triangles, in millimetres.` });
    } catch {
      toast({ title: "Couldn't build the STL", variant: "destructive" });
    }
  };
  const json = () => {
    setOpen(false);
    download(`${slug}.json`, JSON.stringify({ title, author, spec }, null, 2), "application/json");
  };
  const md = () => {
    setOpen(false);
    download(`${slug}-README.md`, readmeMarkdown(title, spec, { author, url: `${window.location.origin}/studio/${designId}` }), "text/markdown");
  };

  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px]";
  return (
    <div className="relative" ref={box}>
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Export">
        <Download className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Export</span>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={stl}>
            <Box className="h-4 w-4 shrink-0" /> <span><b>3D model (.stl)</b><br /><span className="text-xs text-slate-500">For 3D printing, in mm</span></span>
          </button>
          <Link role="menuitem" href={`/studio/${designId}/guide`} className={item} onClick={() => setOpen(false)}>
            <Printer className="h-4 w-4 shrink-0" /> <span><b>Printable build guide</b><br /><span className="text-xs text-slate-500">Parts, wiring, code, safety</span></span>
          </Link>
          <button type="button" role="menuitem" className={item} onClick={json}>
            <FileJson className="h-4 w-4 shrink-0" /> <span><b>Design file (.json)</b><br /><span className="text-xs text-slate-500">The full design spec</span></span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={md}>
            <FileText className="h-4 w-4 shrink-0" /> <span><b>Readme (.md)</b><br /><span className="text-xs text-slate-500">Parts list, wiring and code</span></span>
          </button>
        </div>
      )}
    </div>
  );
}
