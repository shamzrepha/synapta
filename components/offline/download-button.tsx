"use client";

import React from "react";
import { CloudOff, Download, Loader2 } from "lucide-react";
import { useOfflineDownload } from "@/components/offline/use-offline";
import { cn } from "@/lib/utils";

/** "Download for offline" toggle for any GET /api url (notebooks, lessons...). */
export function OfflineDownloadButton({ url, title, className }: { url: string; title: string; className?: string }) {
  const { downloaded, busy, error, download, remove } = useOfflineDownload(url, title);
  return (
    <button
      type="button"
      onClick={downloaded ? remove : download}
      disabled={busy}
      title={error || undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors",
        downloaded
          ? "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300"
          : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900",
        className
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : downloaded ? <CloudOff className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
      {downloaded ? "Downloaded (remove)" : error ? "Retry download" : "Download for offline"}
    </button>
  );
}
