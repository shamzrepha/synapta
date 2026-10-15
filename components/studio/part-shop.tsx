"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ExternalLink, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Viewer3D } from "@/components/studio/viewer3d";
import { circuitTo3D } from "@/lib/studio/circuit/to3d";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { ShopCategory, ShopItem } from "@/lib/studio/parts/shop";

export interface TrayItem {
  type: string;
  qty: number;
}

const TRAY_KEY = "studio:tray";

/** The shopping tray (bill of materials) survives page changes, so the shop and the planner share it. */
export function useTray(): [TrayItem[], (t: TrayItem[]) => void] {
  const [tray, setTray] = useState<TrayItem[]>(() => {
    try {
      const raw = typeof window === "undefined" ? null : window.localStorage.getItem(TRAY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => x && typeof x.type === "string" && Number.isFinite(x.qty)).slice(0, 24) : [];
    } catch {
      return [];
    }
  });
  const set = (t: TrayItem[]) => {
    setTray(t);
    try {
      window.localStorage.setItem(TRAY_KEY, JSON.stringify(t));
    } catch {
      /* private mode: the tray just lives for this visit */
    }
  };
  return [tray, set];
}

export function addToTray(tray: TrayItem[], type: string, by = 1): TrayItem[] {
  const at = tray.find((t) => t.type === type);
  if (!at) return by > 0 ? [...tray, { type, qty: by }] : tray;
  const qty = Math.max(0, Math.min(12, at.qty + by));
  return qty === 0 ? tray.filter((t) => t.type !== type) : tray.map((t) => (t.type === type ? { ...t, qty } : t));
}

interface Catalog {
  categories: ShopCategory[];
  items: ShopItem[];
}

export function useShop(): Catalog | null {
  const [data, setData] = useState<Catalog | null>(null);
  useEffect(() => {
    fetch("/api/studio/parts")
      .then((r) => r.json())
      .then((j) => j.ok && setData({ categories: asArray<ShopCategory>(j.data.categories), items: asArray<ShopItem>(j.data.items) }))
      .catch(() => undefined);
  }, []);
  return data;
}

interface Photo {
  title: string;
  thumb: string;
  page: string;
  license: string;
  credit: string;
}

function PartPhotos({ query }: { query: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/studio/parts/photos?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((j) => live && setPhotos(j.ok ? asArray<Photo>(j.data.photos) : []))
      .catch(() => live && setPhotos([]));
    return () => {
      live = false;
    };
  }, [query]);
  if (photos === null) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (!photos.length) return <p className="text-xs text-slate-500">No reference photo found right now.</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {photos.map((p) => (
        <a key={p.thumb} href={p.page} target="_blank" rel="noreferrer" className="group block rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.thumb} alt={p.title} loading="lazy" className="h-28 w-full object-contain bg-white" />
          <p className="px-2 py-1 text-[10px] text-slate-500 leading-tight">{p.license} · {p.credit}</p>
        </a>
      ))}
    </div>
  );
}

/** A 3D model of the part from its datasheet dimensions (never a guess), with its pinout and facts. */
function PartPreview({ item }: { item: ShopItem }) {
  const parts = useMemo(() => circuitTo3D({ parts: [{ id: "p", type: item.type, x: 0, y: 0, props: undefined }], wires: [] }, new Set()), [item.type]);
  return <Viewer3D parts={parts} explode={0} selectedId={null} onSelect={() => undefined} className="h-52 w-full rounded-xl border border-slate-200 dark:border-slate-800" />;
}

export function PartDetail({ item, qty, onAdd, onClose }: { item: ShopItem; qty: number; onAdd: (by: number) => void; onClose: () => void }) {
  const f = item.facts;
  const srcUrl = (id: string) => f?.sources.find((s) => s.id === id)?.url;
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-label={item.name} onClick={onClose}>
      <div className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#F7F6F2] dark:bg-[#0B0F14] text-slate-900 dark:text-slate-100 p-4 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-mono tracking-widest text-teal-600">{item.category.toUpperCase()}</p>
            <h2 className="text-xl font-extrabold leading-tight">{item.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {item.verified ? (
                <Badge variant="outline" className="gap-1 border-emerald-500/50 text-emerald-600"><BadgeCheck className="h-3 w-3" /> Datasheet-verified</Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-500/50">Simplified model</Badge>
              )}
              {f && <span className="text-slate-500">{f.maker} · {f.partNumber}</span>}
              {item.cost && <span className="font-semibold">{item.cost}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <p className="text-sm">{item.summary}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <PartPreview item={item} />
            {f?.dimsMm ? (
              <p className="text-[11px] text-slate-500">Model size from the datasheet: {f.dimsMm.size[0]} × {f.dimsMm.size[2]} × {f.dimsMm.size[1]} mm (W × D × H).</p>
            ) : (
              <p className="text-[11px] text-slate-500">Illustrative model — no machine-readable dimensions were available, so check the real part before cutting anything.</p>
            )}
            {f && <PartPhotos query={f.imageQuery} />}
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <p className="font-bold">Pinout</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {item.pins.map((p) => (
                  <span key={p.name} className="rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[11px] font-mono" title={p.role}>{p.name}</span>
                ))}
              </div>
            </div>

            {f && (
              <div>
                <p className="font-bold">Datasheet facts</p>
                <ul className="mt-1 space-y-1">
                  {f.facts.map((x, i) => (
                    <li key={i} className="text-xs leading-snug">
                      <span className="font-semibold">{x.label}:</span> {x.value}{" "}
                      {x.approx ? <span className="text-amber-600">(derived for the simulation)</span> : srcUrl(x.src) ? <a href={srcUrl(x.src)} target="_blank" rel="noreferrer" className="text-teal-600 inline-flex items-center gap-0.5">source<ExternalLink className="h-2.5 w-2.5" /></a> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {f?.logic && (
              <div>
                <p className="font-bold">{f.logic.title}</p>
                <div className="mt-1 overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <tbody>
                      {f.logic.rows.map((r, i) => (
                        <tr key={i} className={i === 0 ? "font-bold" : ""}>
                          {r.map((c, k) => <td key={k} className="border border-slate-200 dark:border-slate-700 px-2 py-0.5">{c}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {item.usage.wiring.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-bold">How to wire it</p>
            <ul className="list-disc pl-5 text-xs space-y-0.5">{item.usage.wiring.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {item.usage.code && <pre className="rounded-xl bg-[#0b1220] text-slate-100 p-3 text-[12px] font-mono overflow-x-auto">{item.usage.code}</pre>}
        {item.usage.mistakes.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 p-3 text-xs space-y-0.5">
            <p className="font-bold text-amber-700 dark:text-amber-300">Classic mistakes</p>
            {item.usage.mistakes.map((m, i) => <p key={i}>• {m}</p>)}
          </div>
        )}
        {f && (
          <div className="text-xs">
            <p className="font-bold">Sources</p>
            <ul className="mt-1 space-y-0.5">
              {f.sources.map((s) => (
                <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer" className="text-teal-600 inline-flex items-center gap-1">{s.title}<ExternalLink className="h-3 w-3" /></a> <span className="text-slate-500">({s.kind})</span></li>
              ))}
            </ul>
            <p className="text-slate-500 mt-1">Read on {f.verifiedOn}.</p>
          </div>
        )}

        <div className="flex items-center gap-2 sticky bottom-0 bg-[#F7F6F2] dark:bg-[#0B0F14] pt-2">
          {qty > 0 ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onAdd(-1)} aria-label="One fewer"><Minus className="h-4 w-4" /></Button>
              <span className="font-bold w-8 text-center">{qty}</span>
              <Button size="sm" variant="outline" onClick={() => onAdd(1)} aria-label="One more"><Plus className="h-4 w-4" /></Button>
              <span className="text-xs text-slate-500">in your tray</span>
            </div>
          ) : (
            <Button onClick={() => onAdd(1)}><Plus className="h-4 w-4 mr-1" /> Add to tray</Button>
          )}
          <Button variant="outline" className="ml-auto" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

/** Browse and pick parts. Used on the shop page and inside the planner. */
export function PartShop({ tray, onTray }: { tray: TrayItem[]; onTray: (t: TrayItem[]) => void }) {
  const shop = useShop();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ShopCategory | "All">("All");
  const [open, setOpen] = useState<ShopItem | null>(null);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (shop?.items || []).filter((i) => (cat === "All" || i.category === cat) && (!t || `${i.name} ${i.type} ${i.summary}`.toLowerCase().includes(t)));
  }, [shop, q, cat]);

  if (!shop) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>;
  const qtyOf = (type: string) => tray.find((t) => t.type === type)?.qty || 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts… motor driver, ultrasonic, servo" className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(["All", ...shop.categories] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className={cn("rounded-full px-3 py-1 text-xs font-semibold border", cat === c ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300")}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => {
          const n = qtyOf(i.type);
          return (
            <div key={i.type} className={cn("rounded-2xl border p-3 flex flex-col gap-2 bg-white dark:bg-slate-900", n > 0 ? "border-teal-500" : "border-slate-200 dark:border-slate-800")}>
              <button type="button" onClick={() => setOpen(i)} className="text-left space-y-1">
                <div className="flex items-start gap-2">
                  <p className="font-bold text-sm leading-tight flex-1">{i.name}</p>
                  {i.verified && <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0" aria-label="Datasheet-verified" />}
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-3">{i.summary}</p>
              </button>
              <div className="mt-auto flex items-center gap-2 text-xs">
                <span className="text-slate-500">{i.category}</span>
                <span className="font-semibold">{i.cost}</span>
                <span className="ml-auto flex items-center gap-1">
                  {n > 0 && (
                    <button type="button" aria-label="One fewer" onClick={() => onTray(addToTray(tray, i.type, -1))} className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
                  )}
                  {n > 0 && <span className="w-5 text-center font-bold">{n}</span>}
                  <button type="button" aria-label={`Add ${i.name}`} onClick={() => onTray(addToTray(tray, i.type, 1))} className="h-7 w-7 rounded-lg bg-teal-600 text-white flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
                </span>
              </div>
            </div>
          );
        })}
        {!items.length && <p className="text-sm text-slate-500 col-span-full">No part matches that search.</p>}
      </div>
      {open && <PartDetail item={open} qty={qtyOf(open.type)} onAdd={(by) => onTray(addToTray(tray, open.type, by))} onClose={() => setOpen(null)} />}
    </div>
  );
}
