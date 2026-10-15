"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Settings as SettingsIcon, Gauge, Sparkles, VolumeX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePrefs, writePrefs } from "@/components/settings/use-prefs";
import { PREFS_KEY, parsePrefs, type Prefs } from "@/lib/settings/prefs";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ key: keyof Prefs; title: string; desc: string; icon: React.ReactNode }> = [
  { key: "dataSaver", title: "Data saver", desc: "Audio and 3D wait for a tap, images load smaller, videos don't autoplay.", icon: <Gauge className="h-5 w-5" /> },
  { key: "reduceMotion", title: "Reduce motion", desc: "Calmer animations.", icon: <Sparkles className="h-5 w-5" /> },
  { key: "noAutoplay", title: "Don't autoplay audio or video", desc: "Nothing starts playing until you press play.", icon: <VolumeX className="h-5 w-5" /> },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700")}
    >
      <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export default function SettingsPage() {
  const [prefs, update] = usePrefs();

  // First visit on this device: adopt what the student saved on another device.
  useEffect(() => {
    let has = false;
    try {
      has = localStorage.getItem(PREFS_KEY) !== null;
    } catch {
      /* ignore */
    }
    if (has) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data.prefs) writePrefs(parsePrefs(j.data.prefs));
      })
      .catch(() => null);
  }, []);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-7 w-7 text-teal-600" /> Settings
        </h1>
        <p className="text-sm text-slate-500">Save data and tame autoplay. Kept on this device and in your account.</p>
      </div>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {OPTIONS.map((o) => (
          <div key={o.key} className="flex items-center gap-3 p-4">
            <span className="text-teal-600">{o.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{o.title}</p>
              <p className="text-xs text-slate-500">{o.desc}</p>
            </div>
            <Toggle on={prefs[o.key]} onChange={(v) => update({ [o.key]: v })} label={o.title} />
          </div>
        ))}
      </Card>
      <Link href="/offline" className="inline-block rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-900">
        Offline downloads
      </Link>
    </div>
  );
}
