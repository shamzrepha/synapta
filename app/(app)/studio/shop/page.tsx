"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PartShop, useTray } from "@/components/studio/part-shop";
import { useShop } from "@/components/studio/part-shop";

export default function ShopPage() {
  const [tray, setTray] = useTray();
  const shop = useShop();
  const count = tray.reduce((n, t) => n + t.qty, 0);
  const name = (type: string) => shop?.items.find((i) => i.type === type)?.name || type;
  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/studio" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to Maker Studio"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <p className="text-xs font-mono tracking-widest text-teal-600">MAKER SPACE</p>
          <h1 className="text-xl font-extrabold">Parts shop</h1>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
        Every part here has a real pinout, a 3D model sized from its datasheet, and (where marked) datasheet-verified behaviour. Pick what you want to build with — the AI designs with exactly these parts and nothing it invented.
      </p>
      <PartShop tray={tray} onTray={setTray} />
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-40 px-3">
          <div className="mx-auto max-w-3xl rounded-2xl bg-slate-900 text-white p-3 flex items-center gap-3 shadow-xl">
            <Wrench className="h-5 w-5 text-amber-300 shrink-0" />
            <p className="text-xs flex-1 min-w-0 truncate">{count} part{count > 1 ? "s" : ""}: {tray.map((t) => `${t.qty}× ${name(t.type)}`).join(", ")}</p>
            <Button size="sm" variant="outline" className="text-slate-900" onClick={() => setTray([])}>Clear</Button>
            <Link href="/studio/new"><Button size="sm" className="bg-amber-400 text-slate-900 hover:bg-amber-300">Plan a build</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
