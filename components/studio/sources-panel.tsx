"use client";

import React, { useMemo } from "react";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { shopItem } from "@/lib/studio/parts/shop";
import type { DesignSpec } from "@/lib/studio/spec";

/** What this design is built from, and where each part's behaviour came from. */
export function SourcesPanel({ spec }: { spec: DesignSpec }) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of spec.circuit?.parts || []) counts.set(p.type, (counts.get(p.type) || 0) + 1);
    return Array.from(counts, ([type, qty]) => ({ type, qty, item: shopItem(type) })).filter((r) => r.item);
  }, [spec.circuit]);
  const verified = rows.filter((r) => r.item!.verified).length;

  if (!rows.length && !spec.research) {
    return <p className="text-sm text-slate-500">This design has no circuit parts, so there are no datasheets to show. Mechanical sizes are in the Parts &amp; sizes tab.</p>;
  }
  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <>
          <p className="text-sm">
            <span className="font-bold">{verified} of {rows.length}</span> part types come from real datasheets. The rest are simplified models.
          </p>
          {rows.map(({ type, qty, item }) => {
            const f = item!.facts;
            return (
              <details key={type} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3" open={item!.verified && rows.length <= 4}>
                <summary className="cursor-pointer text-sm font-semibold flex items-center gap-1.5">
                  {qty} × {item!.name}
                  {item!.verified ? <BadgeCheck className="h-4 w-4 text-emerald-500" aria-label="Datasheet-verified" /> : <span className="text-[10px] text-amber-600 font-normal">simplified</span>}
                </summary>
                <div className="mt-2 space-y-2 text-xs">
                  <p>{item!.summary}</p>
                  {f && (
                    <ul className="space-y-1">
                      {f.facts.map((x, i) => (
                        <li key={i}><span className="font-semibold">{x.label}:</span> {x.value}{x.approx ? <span className="text-amber-600"> (derived for the simulation)</span> : null}</li>
                      ))}
                    </ul>
                  )}
                  {f?.logic && (
                    <div className="overflow-x-auto">
                      <p className="font-semibold">{f.logic.title}</p>
                      <table className="mt-1 border-collapse">
                        <tbody>
                          {f.logic.rows.map((r, i) => (
                            <tr key={i} className={i === 0 ? "font-bold" : ""}>{r.map((c, k) => <td key={k} className="border border-slate-200 dark:border-slate-700 px-2 py-0.5">{c}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {f && (
                    <ul className="space-y-0.5">
                      {f.sources.map((s) => (
                        <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer" className="text-teal-600 inline-flex items-center gap-1">{s.title}<ExternalLink className="h-3 w-3" /></a></li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            );
          })}
        </>
      )}
      {spec.research && (
        <div className="space-y-1">
          <p className="text-sm font-bold">Research the AI read before building</p>
          <pre className="whitespace-pre-wrap text-xs rounded-xl bg-slate-100 dark:bg-slate-900 p-3">{spec.research.notes}</pre>
          <ul className="text-xs space-y-0.5">
            {spec.research.sources.map((s) => (
              <li key={s.uri}><a href={s.uri} target="_blank" rel="noreferrer" className="text-teal-600 inline-flex items-center gap-1">{s.title || s.uri}<ExternalLink className="h-3 w-3" /></a></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
