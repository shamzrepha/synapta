"use client";

import React, { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { asArray } from "@/lib/api/client";
import type { SourceAnchor } from "@/lib/worlds/types";
import { cn } from "@/lib/utils";

interface Page {
  pageNo: number;
  lines: Array<{ lineNo: number; text: string; flagged?: boolean }>;
}

/** "View in my notes" (spec 8, 14.1): the student's own page, opened at the line a fact came from. */
export function SourceDrawer({ anchor, onClose }: { anchor: SourceAnchor; onClose: () => void }) {
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/worlds/docs/${anchor.docId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) return setFailed(true);
        setTitle(j.data.title);
        setPage(asArray<Page>(j.data.pages).find((p) => p.pageNo === anchor.pageNo) ?? null);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [anchor]);
  const near = (n: number) => n >= anchor.lineStart - 3 && n <= anchor.lineEnd + 3;
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Your notes">
      <div className="w-full sm:max-w-lg max-h-[80vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-semibold truncate">{title || "Your notes"} · page {anchor.pageNo}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        {failed ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t open that page. Your note may belong to someone else or was deleted.</p>
        ) : !page ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Opening your notes…</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {page.lines.filter((l) => near(l.lineNo)).map((l) => {
              const hit = l.lineNo >= anchor.lineStart && l.lineNo <= anchor.lineEnd;
              return (
                <li key={l.lineNo} className={cn("rounded-md px-2 py-1", hit ? "bg-brand-500/15 border-l-4 border-brand-600 font-medium" : "text-muted-foreground")}>
                  <span className="mr-2 text-[10px] tabular-nums opacity-60">{l.lineNo}</span>{l.text}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
