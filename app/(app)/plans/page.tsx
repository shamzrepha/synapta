"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fetchJson } from "@/lib/api/client";
import { FEATURES, FEATURE_LABEL, type FeatureKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

interface WirePlan {
  id: string;
  label: string;
  blurb: string;
  priceMonthNgn: number;
  priceTermNgn: number;
  perks: string[];
  limits: Record<FeatureKey, number | null>;
}
interface Me {
  period: string;
  enforced: boolean;
  paymentsReady: boolean;
  plan: WirePlan;
  planExpiresAt: string | null;
  usage: Record<FeatureKey, number>;
  tokens: { used: number; limit: number };
  plans: WirePlan[];
  isAdmin: boolean;
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold capitalize">{label}</span>
        <span className="font-mono text-slate-500">{limit === null ? `${used} (no cap)` : limit === 0 ? "not included" : `${used} / ${limit}`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-teal-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PlansPage() {
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState("");
  const [grant, setGrant] = useState({ email: "", plan: "plus", days: "30" });

  const load = useCallback(async () => {
    const j = await fetchJson<Me>("/api/billing/me");
    if (j.ok) setMe(j.data);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    // coming back from the payment page: the plan appears once Paystack has told us, usually within seconds
    const paid = new URLSearchParams(window.location.search).get("paid") === "1";
    const again = paid ? setTimeout(() => void load(), 6000) : undefined;
    return () => {
      clearTimeout(t);
      if (again) clearTimeout(again);
    };
  }, [load]);

  const buy = async (plan: string, term: "month" | "term") => {
    setBusy(`${plan}-${term}`);
    const j = await fetchJson<{ url: string }>("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, term }) });
    setBusy("");
    if (j.ok) window.location.assign(j.data.url);
    else toast({ title: "Couldn't start the payment", description: j.error.message, variant: "destructive" });
  };

  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("grant");
    const j = await fetchJson<{ expiresAt: string }>("/api/admin/billing/grant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: grant.email, plan: grant.plan, days: Number(grant.days) }) });
    setBusy("");
    toast(j.ok ? { title: "Plan given", description: `Until ${new Date(j.data.expiresAt).toLocaleDateString()}`, variant: "success" } : { title: "Couldn't give the plan", description: j.error.message, variant: "destructive" });
  };

  if (!me) return <Skeleton className="h-96 rounded-2xl" />;
  const paid = me.plan.id !== "free" && me.planExpiresAt;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono tracking-widest text-teal-600">PLANS & USAGE</p>
        <h1 className="text-2xl font-extrabold">You&apos;re on {me.plan.label}</h1>
        <p className="text-sm text-slate-500">
          {paid ? `Active until ${new Date(me.planExpiresAt!).toLocaleDateString()}.` : "Everything your teachers publish is free. Your own AI use has a monthly allowance."}
          {!me.enforced && " Limits are shown for planning; nothing is blocked yet."}
        </p>
      </div>

      <Card className="p-4 md:p-5 space-y-3">
        <p className="font-bold text-sm">This month ({me.period})</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.filter((f) => me.plan.limits[f] !== 0 || me.usage[f] > 0).map((f) => (
            <Meter key={f} label={FEATURE_LABEL[f].many} used={me.usage[f]} limit={me.plan.limits[f]} />
          ))}
          <Meter label="AI tutor and everything else (tokens)" used={me.tokens.used} limit={me.tokens.limit} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {me.plans.map((p) => {
          const current = p.id === me.plan.id;
          const buyable = p.id === "plus" || p.id === "teacher";
          return (
            <Card key={p.id} className={cn("p-4 space-y-3 flex flex-col", current && "border-teal-500 ring-1 ring-teal-500")}>
              <div>
                <p className="font-extrabold text-lg">{p.label}</p>
                <p className="text-xs text-slate-500">{p.blurb}</p>
              </div>
              <p className="text-2xl font-extrabold">{p.id === "free" ? "₦0" : p.id === "school" ? "Per seat" : naira(p.priceMonthNgn)}{buyable && <span className="text-xs font-normal text-slate-500"> / month</span>}</p>
              {buyable && <p className="text-xs text-slate-500 -mt-2">or {naira(p.priceTermNgn)} for a whole term (4 months)</p>}
              <ul className="space-y-1.5 text-xs flex-1">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex gap-1.5"><Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-teal-600" /> {perk}</li>
                ))}
              </ul>
              {current ? (
                <p className="text-xs font-bold text-teal-700 dark:text-teal-300">Your current plan</p>
              ) : buyable ? (
                me.paymentsReady ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => buy(p.id, "month")}>{busy === `${p.id}-month` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Monthly"}</Button>
                    <Button size="sm" disabled={!!busy} onClick={() => buy(p.id, "term")}>{busy === `${p.id}-term` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Whole term"}</Button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Online payment opens soon.</p>
                )
              ) : p.id === "school" ? (
                <p className="text-xs text-slate-500">Schools: ask us for a quote.</p>
              ) : null}
            </Card>
          );
        })}
      </div>

      {me.isAdmin && (
        <Card className="p-4 space-y-2">
          <p className="font-bold text-sm">Give someone a plan (admin)</p>
          <form onSubmit={give} className="flex flex-wrap gap-2">
            <input required type="email" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} placeholder="their email" className="flex-1 min-w-[200px] h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm" />
            <select value={grant.plan} onChange={(e) => setGrant({ ...grant, plan: e.target.value })} aria-label="Plan" className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm">
              {me.plans.filter((p) => p.id !== "free").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input required type="number" min={1} max={366} value={grant.days} onChange={(e) => setGrant({ ...grant, days: e.target.value })} aria-label="Days" className="w-20 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm" />
            <Button size="sm" disabled={busy === "grant"}>Give</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
