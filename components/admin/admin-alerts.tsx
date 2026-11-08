"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchJson, asArray } from "@/lib/api/client";
import type { AdminAlert } from "@/lib/admin/alerts";

const ICON = { danger: CircleAlert, warning: TriangleAlert, info: Info } as const;
const TONE = {
  danger: "border-rose-400/50 bg-rose-500/10 text-rose-900 dark:text-rose-200",
  warning: "border-amber-400/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  info: "border-brand-500/30 bg-brand-500/10 text-brand-900 dark:text-brand-200",
} as const;

/** What needs the admin's attention right now (teacher requests, problem reports, plans ending, payments, AI paused). */
export function AdminAlerts() {
  const [alerts, setAlerts] = useState<AdminAlert[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchJson<{ alerts: AdminAlert[] }>("/api/admin/alerts").then((r) => {
        if (alive && r.ok) setAlerts(asArray<AdminAlert>(r.data.alerts));
      });
    const first = setTimeout(load, 0);
    const t = setInterval(load, 2 * 60_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  if (alerts === null) return null;
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-brand-600" />
        <p className="font-bold text-sm">Needs your attention</p>
        <span className="ml-auto text-[11px] text-slate-500">{alerts.length === 0 ? "All clear" : `${alerts.length} item${alerts.length === 1 ? "" : "s"}`}</span>
      </div>
      {alerts.length === 0 ? (
        <p className="text-xs text-slate-500">No teacher requests, problem reports or ending plans right now.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const Icon = ICON[a.level];
            return (
              <li key={a.id}>
                <Link href={a.href} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${TONE[a.level]}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <b className="block">{a.title}</b>
                    <span className="block text-xs opacity-80">{a.detail}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
