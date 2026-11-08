"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DeviceData {
  total: number;
  active7d: number;
  platform: Record<string, number>;
  formFactor: Record<string, number>;
  mode: Record<string, number>;
  browser: Record<string, number>;
  appBuild: Record<string, number>;
}

const LABELS: Record<string, string> = {
  android: "Android",
  ios: "iPhone / iPad (iOS)",
  windows: "Windows",
  mac: "Mac",
  linux: "Linux",
  chromeos: "Chromebook",
  phone: "Phone",
  tablet: "Tablet",
  desktop: "Computer",
  "android-app": "Android app",
  "installed-web-app": "Installed web app",
  browser: "Website in a browser",
};

function Breakdown({ title, counts, total }: { title: string; counts: Record<string, number>; total: number }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-bold">{title}</h3>
      {rows.length === 0 && <p className="text-xs text-slate-500">No data yet.</p>}
      {rows.map(([k, n]) => {
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={k} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-medium">{LABELS[k] ?? k}</span>
              <span className="text-slate-500">
                {n} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/** Admin tab: which devices and platforms learners use (each person counted once, by their latest visit). */
export function DeviceStats() {
  const [data, setData] = useState<DeviceData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/devices", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok) setData(j.data as DeviceData);
        else setError(true);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <Card className="p-6 text-sm">Could not load device data.</Card>;
  if (!data) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm">
        <strong>{data.total}</strong> people have reported a device so far, <strong>{data.active7d}</strong> of them in the last 7 days. People show up
        after their next visit, so numbers fill in over the first few days.
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown title="App vs website" counts={data.mode} total={data.total} />
        <Breakdown title="Phone, tablet or computer" counts={data.formFactor} total={data.total} />
        <Breakdown title="Operating system" counts={data.platform} total={data.total} />
        <Breakdown title="Browser" counts={data.browser} total={data.total} />
        {Object.keys(data.appBuild).length > 0 && <Breakdown title="Android app versions (build)" counts={data.appBuild} total={Object.values(data.appBuild).reduce((a, b) => a + b, 0)} />}
      </div>
    </div>
  );
}
