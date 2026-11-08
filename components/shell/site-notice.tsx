"use client";

import React, { useEffect, useState } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { fetchJson } from "@/lib/api/client";
import { useUserStore } from "@/lib/store/use-user-store";

interface Site {
  notice: { text: string; level: "info" | "warning" } | null;
  aiPaused: boolean;
}

/** The admin's site-wide message (and a note when AI is paused), shown at the top of the app. Renders nothing when there is none. */
export function SiteNotice() {
  const { user } = useUserStore();
  const [site, setSite] = useState<Site | null>(null);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const load = () =>
      fetchJson<Site>("/api/site")
        .then((r) => {
          if (alive && r.ok) setSite(r.data);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [uid]);

  const lines: Array<{ text: string; warn: boolean }> = [];
  if (site?.notice) lines.push({ text: site.notice.text, warn: site.notice.level === "warning" });
  if (site?.aiPaused) lines.push({ text: "AI features are paused for a short while. Reading, notes and your saved work still work.", warn: true });
  if (!lines.length) return null;
  return (
    <div className="mb-3 space-y-2" role="status">
      {lines.map((l) => (
        <div key={l.text} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${l.warn ? "border-amber-400/50 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "border-brand-500/30 bg-brand-500/10 text-brand-900 dark:text-brand-200"}`}>
          {l.warn ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 break-words">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
