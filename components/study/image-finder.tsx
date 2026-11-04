"use client";

import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchJson, asArray } from "@/lib/api/client";
import type { FoundImage } from "@/lib/images/commons";

/** Looks up real, freely licensed pictures (a circuit board, a cell, a map) to go with what the student is studying. */
export function ImageFinder({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [images, setImages] = useState<FoundImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const search = async (term: string) => {
    if (term.trim().length < 2) return;
    setBusy(true);
    setFailed(false);
    const j = await fetchJson<{ images: FoundImage[] }>(`/api/images/search?q=${encodeURIComponent(term.trim())}`);
    if (j.ok) setImages(asArray<FoundImage>(j.data.images));
    else setFailed(true);
    setBusy(false);
  };
  useEffect(() => {
    const t = setTimeout(() => void search(initialQuery), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <Card className="p-4 md:p-5 space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void search(q); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={120} placeholder="What do you want to see? e.g. Arduino Uno, plant cell" className="flex-1 min-w-0 h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm" />
        <Button disabled={busy || q.trim().length < 2}><Search className="h-4 w-4 mr-1" /> {busy ? "Searching…" : "Find"}</Button>
      </form>
      {failed && <p className="text-sm text-rose-600">Couldn&apos;t search right now. Please try again.</p>}
      {images && images.length === 0 && !busy && <p className="text-sm text-slate-500">No pictures found. Try a simpler or more common name.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(images || []).map((im) => (
          <figure key={im.url} className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt={im.title} loading="lazy" referrerPolicy="no-referrer" className="mx-auto h-44 w-auto max-w-full object-contain" />
            <figcaption className="text-[11px] text-slate-500">
              <span className="block font-semibold text-slate-700 dark:text-slate-200">{im.title}</span>
              <a href={im.page} target="_blank" rel="noopener noreferrer" className="underline">{im.author}, {im.license}, Wikimedia Commons</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}
