"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EnforcementPanel } from "@/components/billing/enforcement-panel";
import { AdminPeople } from "@/components/billing/admin-people";
import { AdminAlerts } from "@/components/admin/admin-alerts";
import { fetchJson, asArray } from "@/lib/api/client";

interface Overview {
  totals: { allTimeNgn: number; thisMonthNgn: number; paymentCount: number; paymentsThisMonth: number; showingLatest: boolean };
  subscribers: { active: number; byPlan: Record<string, number>; expiringSoon: number };
  payments: Array<{ reference: string; name: string; email: string; plan: string; term: string; channel: string; amountNgn: number; at: string; expiresAt: string }>;
  activeSubscribers: Array<{ uid: string; name: string; email: string; plan: string; expiresAt: string; grantedByAdmin: boolean }>;
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </Card>
  );
}

export default function AdminBilling() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetchJson<Overview>("/api/admin/billing/overview").then((j) => {
      if (!live) return;
      if (j.ok) setData(j.data);
      else setError(j.error.message);
    });
    return () => {
      live = false;
    };
  }, []);

  if (error) return <Card className="p-6 text-sm">{error}</Card>;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  const { totals, subscribers } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono tracking-widest text-brand-600">ADMIN</p>
          <h1 className="text-2xl font-extrabold">Payments and subscribers</h1>
        </div>
        <Link href="/admin" className="text-xs font-semibold text-brand-700 dark:text-brand-300 underline">Back to admin</Link>
      </div>

      <AdminAlerts />
      <EnforcementPanel />

      <AdminPeople />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue this month" value={naira(totals.thisMonthNgn)} hint={`${totals.paymentsThisMonth} payments`} />
        <Stat label="Revenue (all recorded)" value={naira(totals.allTimeNgn)} hint={totals.showingLatest ? "latest 300 payments" : `${totals.paymentCount} payments`} />
        <Stat label="Active subscribers" value={String(subscribers.active)} hint={Object.entries(subscribers.byPlan).map(([p, n]) => `${n} ${p}`).join(" · ") || "none yet"} />
        <Stat label="Ending within 7 days" value={String(subscribers.expiringSoon)} hint="people to remind to renew" />
      </div>

      <Card className="p-4 space-y-2 overflow-x-auto">
        <p className="font-bold text-sm">Payments</p>
        {data.payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments yet. They appear here as soon as Paystack confirms them.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3">Date</th><th className="pr-3">Who</th><th className="pr-3">Plan</th><th className="pr-3">Amount</th><th className="pr-3">Paid by</th><th>Runs until</th>
              </tr>
            </thead>
            <tbody>
              {asArray<Overview["payments"][number]>(data.payments).map((p) => (
                <tr key={p.reference} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{day(p.at)}</td>
                  <td className="pr-3"><span className="font-semibold">{p.name || "—"}</span><br /><span className="text-slate-500">{p.email}</span></td>
                  <td className="pr-3 capitalize">{p.plan} · {p.term}</td>
                  <td className="pr-3 font-mono">{naira(p.amountNgn)}</td>
                  <td className="pr-3">{p.channel.replace("_", " ")}</td>
                  <td className="whitespace-nowrap">{day(p.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4 space-y-2 overflow-x-auto">
        <p className="font-bold text-sm">Active subscribers (soonest to end first)</p>
        {data.activeSubscribers.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody is on a paid plan yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Who</th><th className="pr-3">Plan</th><th>Until</th></tr></thead>
            <tbody>
              {data.activeSubscribers.map((s) => (
                <tr key={s.uid} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-1.5 pr-3"><span className="font-semibold">{s.name || "—"}</span><br /><span className="text-slate-500">{s.email}</span></td>
                  <td className="pr-3 capitalize">{s.plan}{s.grantedByAdmin ? " (given by an admin)" : ""}</td>
                  <td className="whitespace-nowrap">{day(s.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
