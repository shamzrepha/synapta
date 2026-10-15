"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseSpec, type DesignSpec } from "@/lib/studio/spec";
import { buildGuide } from "@/lib/studio/guide";
import { formatNaira } from "@/lib/studio/bom";

interface Loaded {
  title: string;
  author: string;
  spec: DesignSpec;
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .guide-print, .guide-print * { visibility: visible !important; }
  .guide-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; background: #fff !important; color: #000 !important; }
  .no-print { display: none !important; }
  .guide-print h2 { break-after: avoid; }
  .guide-print table, .guide-print pre, .guide-print li { break-inside: avoid; }
  @page { margin: 16mm; }
}`;

export default function BuildGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/studio/designs/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j.ok) return setError(j.error?.message || "Couldn't open this design.");
        try {
          setData({ title: j.data.design.title, author: j.data.design.ownerName, spec: parseSpec(j.data.spec) });
        } catch {
          setError("This design could not be read.");
        }
      })
      .catch(() => live && setError("Couldn't open this design."));
    return () => {
      live = false;
    };
  }, [id]);

  const g = useMemo(() => (data ? buildGuide(data.title, data.spec) : null), [data]);

  if (error) {
    return (
      <Card className="p-8 text-center text-sm space-y-3">
        <p>{error}</p>
        <Link href={`/studio/${id}`} className="text-teal-600 font-semibold">Back to the design</Link>
      </Card>
    );
  }
  if (!data || !g) return <Skeleton className="h-96 rounded-2xl" />;

  const h2 = "text-lg font-extrabold mt-7 mb-2 pb-1 border-b-2 border-slate-900 dark:border-slate-200 print:border-black";
  const th = "text-left text-[11px] uppercase tracking-wide text-slate-500 px-2 py-1.5";
  const td = "px-2 py-1.5 align-top border-t border-slate-200 dark:border-slate-800 print:border-slate-300";

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print flex items-center gap-2">
        <Link href={`/studio/${id}`} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to the design">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <p className="font-bold flex-1 truncate">Real-build guide</p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" /> Print / Save as PDF
        </Button>
      </div>

      <article className="guide-print rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 p-5 sm:p-8 text-[15px] leading-relaxed">
        <p className="text-[11px] font-mono tracking-widest text-teal-700">SUNROOT MAKER STUDIO · BUILD GUIDE</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight mt-1">{g.title}</h1>
        <p className="text-xs text-slate-500 mt-1">Design by {data.author}</p>
        {g.summary && <p className="mt-3">{g.summary}</p>}

        <h2 className={h2}>1. Parts you need</h2>
        {g.bom.lines.length === 0 ? (
          <p className="text-slate-500">This design has no electronic parts to buy.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr>
                  <th className={th}>Qty</th>
                  <th className={th}>Part</th>
                  <th className={`${th} text-right`}>Price each</th>
                  <th className={`${th} text-right`}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {g.bom.lines.map((l) => (
                  <tr key={l.type}>
                    <td className={`${td} font-bold`}>{l.qty}</td>
                    <td className={td}>{l.name}</td>
                    <td className={`${td} text-right`}>{formatNaira(l.unit)}</td>
                    <td className={`${td} text-right`}>{formatNaira(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className={`${td} font-extrabold border-t-2 border-slate-900 dark:border-slate-200`}>Estimated total</td>
                  <td className={`${td} text-right font-extrabold border-t-2 border-slate-900 dark:border-slate-200`}>{formatNaira(g.bom.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-1">Prices are Maker Space shop estimates. Also have a breadboard or jumper wires, and tools to hold the build together.</p>

        <h2 className={h2}>2. Safety checklist</h2>
        <ul className="space-y-1">
          {g.safety.map((s) => (
            <li key={s} className="flex gap-2">
              <span aria-hidden className="mt-1 h-4 w-4 shrink-0 rounded border-2 border-slate-700 dark:border-slate-300 print:border-black" />
              <span>{s}</span>
            </li>
          ))}
        </ul>

        {g.wires.length > 0 && (
          <>
            <h2 className={h2}>3. Wiring table</h2>
            <p className="text-xs text-slate-500 mb-1">Do one row at a time and tick it off. Power off while you wire.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr>
                    <th className={th}>#</th>
                    <th className={th}>From</th>
                    <th className={th}>To</th>
                    <th className={th}>Wire</th>
                    <th className={th}>Done</th>
                  </tr>
                </thead>
                <tbody>
                  {g.wires.map((w) => (
                    <tr key={w.n}>
                      <td className={`${td} font-bold`}>{w.n}</td>
                      <td className={td}>{w.from}</td>
                      <td className={td}>{w.to}</td>
                      <td className={`${td} capitalize`}>{w.color}</td>
                      <td className={td}><span aria-hidden className="inline-block h-4 w-4 rounded border-2 border-slate-700 dark:border-slate-300 print:border-black" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {g.code.trim() && (
          <>
            <h2 className={h2}>4. Code</h2>
            <p className="text-xs text-slate-500 mb-1">Type or paste this into the Arduino IDE and upload it to the board.</p>
            <pre className="rounded-xl bg-slate-100 dark:bg-slate-950 print:bg-slate-100 p-3 text-[12.5px] leading-snug overflow-x-auto whitespace-pre-wrap break-words font-mono">{g.code}</pre>
          </>
        )}

        {g.warnings.length > 0 && (
          <>
            <h2 className={h2}>5. Watch out for these</h2>
            <p className="text-xs text-slate-500 mb-1">From the manufacturers&apos; datasheets and common beginner mistakes.</p>
            <div className="space-y-3">
              {g.warnings.map((w) => (
                <div key={w.type}>
                  <p className="font-bold text-sm">{w.name}</p>
                  <ul className="list-disc pl-5 text-sm space-y-0.5">
                    {w.warnings.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        {g.steps.length > 0 && (
          <>
            <h2 className={h2}>6. Build order</h2>
            <ol className="list-decimal pl-5 space-y-0.5">
              {g.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </>
        )}
      </article>
    </div>
  );
}
