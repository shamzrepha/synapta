"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fetchJson } from "@/lib/api/client";
import { FEATURES, FEATURE_LABEL, termSavingsPercent, type FeatureKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

interface WirePlan {
  id: string;
  audience: "student" | "teacher" | "school";
  label: string;
  codename: string;
  blurb: string;
  badge?: string;
  priceMonthNgn: number;
  priceTermNgn: number;
  perSeatTermNgn?: number;
  monthlyTokens: number;
  perMinute: number;
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
  role: string;
  grant: { kind: string; note: string } | null;
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const GRANT_LABEL: Record<string, string> = { gift: "a free subscription from the Sunroot team", trial: "a free trial", test: "a test account" };
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const compact = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}k` : String(n));

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold">{sentence(label)}</span>
        <span className="font-mono text-slate-500">{limit === null ? `${used} (no cap)` : limit === 0 ? "not included" : `${used} / ${limit}`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-teal-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The rows of the comparison table, grouped the way subscription pages usually are. */
const MATRIX: Array<{ group: string; rows: Array<{ label: string; get: (p: WirePlan) => string }> }> = [
  {
    group: "Study tools",
    rows: FEATURES.filter((f) => ["notes", "scan_pages", "lessons", "practice"].includes(f)).map((f) => ({ label: FEATURE_LABEL[f].many, get: (p: WirePlan) => (p.limits[f] === null ? "Unlimited" : p.limits[f] === 0 ? "Not included" : String(p.limits[f])) })),
  },
  {
    group: "Build and teach",
    rows: FEATURES.filter((f) => ["studio_ai", "class_build"].includes(f)).map((f) => ({ label: FEATURE_LABEL[f].many, get: (p: WirePlan) => (p.limits[f] === null ? "Unlimited" : p.limits[f] === 0 ? "—" : String(p.limits[f])) })),
  },
  {
    group: "AI power",
    rows: [
      { label: "AI tutor and everything else (tokens a month)", get: (p) => compact(p.monthlyTokens) },
      { label: "AI speed (requests a minute)", get: (p) => String(p.perMinute) },
    ],
  },
];

export default function PlansPage() {
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState("");
  const [term, setTerm] = useState<"month" | "term">("term");
  const [tab, setTab] = useState<"student" | "teacher" | null>(null);

  const load = useCallback(async () => {
    const j = await fetchJson<Me>("/api/billing/me");
    if (j.ok) setMe(j.data);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    // coming back from Paystack: ask Paystack straight away whether the payment went through, so the plan shows at once
    const q = new URLSearchParams(window.location.search);
    const reference = q.get("reference") || q.get("trxref");
    if (q.get("paid") === "1" && reference) {
      fetchJson<{ paid: boolean; plan?: string }>(`/api/billing/verify?reference=${encodeURIComponent(reference)}`).then((j) => {
        if (j.ok && j.data.paid) toast({ title: "Payment received", description: "Your plan is active. Thank you!", variant: "success" });
        else toast({ title: "Checking your payment…", description: "If it doesn't show in a minute, contact us with your payment reference.", variant: "amber" });
        void load();
      });
    }
    return () => clearTimeout(t);
  }, [load, toast]);

  const buy = async (plan: string, period: "month" | "term") => {
    setBusy(`${plan}-${period}`);
    const j = await fetchJson<{ url: string }>("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, term: period }) });
    setBusy("");
    if (j.ok) window.location.assign(j.data.url);
    else toast({ title: "Couldn't start the payment", description: j.error.message, variant: "destructive" });
  };

  if (!me) return <Skeleton className="h-96 rounded-2xl" />;
  const paid = me.plan.id !== "free" && !!me.planExpiresAt;
  const teaching = me.plans.some((p) => p.audience === "teacher");
  const audience = tab ?? (me.role === "teacher" ? "teacher" : "student");
  const shown = me.plans.filter((p) => (audience === "teacher" ? p.audience !== "student" : p.audience === "student"));
  const topSaving = Math.max(0, ...shown.map((p) => termSavingsPercent(p)));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono tracking-widest text-teal-600">PLANS & USAGE</p>
        <h1 className="text-2xl font-extrabold">You&apos;re on {me.plan.label} <span className="text-base font-semibold text-slate-400">{me.plan.codename}</span></h1>
        <p className="text-sm text-slate-500">
          {paid ? `Active until ${new Date(me.planExpiresAt!).toLocaleDateString()}${me.grant ? `, ${GRANT_LABEL[me.grant.kind] || ""}` : ""}.` : "Everything your teachers publish is free. Your own AI use has a monthly allowance."}
          {!me.enforced && " Limits are shown for planning; nothing is blocked yet."}
          {me.isAdmin && (
            <>
              {" "}
              <Link href="/admin/billing" className="font-semibold text-teal-700 dark:text-teal-300 underline">Admin: payments, people and the limits switch →</Link>
            </>
          )}
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

      <div className="flex flex-wrap items-center gap-3">
        {teaching && (
          <div className="inline-flex rounded-full border border-slate-300 dark:border-slate-700 p-1" role="tablist" aria-label="Who the plans are for">
            {(["student", "teacher"] as const).map((a) => (
              <button key={a} type="button" role="tab" aria-selected={audience === a} onClick={() => setTab(a)} className={cn("rounded-full px-4 py-1.5 text-xs font-bold", audience === a ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300")}>
                {a === "student" ? "For students" : "For teachers"}
              </button>
            ))}
          </div>
        )}
        <div className="inline-flex rounded-full border border-slate-300 dark:border-slate-700 p-1" role="group" aria-label="Billing period">
          {(["month", "term"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={term === t} onClick={() => setTerm(t)} className={cn("rounded-full px-4 py-1.5 text-xs font-bold", term === t ? "bg-teal-600 text-white" : "text-slate-600 dark:text-slate-300")}>
              {t === "month" ? "Monthly" : "Semester (4 months)"}
            </button>
          ))}
        </div>
        {term === "term" && topSaving > 0 && <span className="text-xs font-semibold text-emerald-600">Pay once for the semester and save up to {topSaving}%</span>}
      </div>

      <div className={cn("grid gap-4 md:grid-cols-2", shown.length >= 5 ? "xl:grid-cols-5" : shown.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
        {shown.map((p) => {
          const current = p.id === me.plan.id;
          const buyable = p.audience !== "school" && p.priceMonthNgn > 0;
          return (
            <Card key={p.id} className={cn("relative p-4 space-y-3 flex flex-col", current && "border-teal-500 ring-1 ring-teal-500", p.badge && !current && "border-amber-500/60")}>
              {p.badge && <span className="absolute -top-2.5 right-3 rounded-full bg-[#F28C28] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#12241C]">{p.badge}</span>}
              <div>
                <p className="font-extrabold text-lg leading-tight">{p.label}</p>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-600">{p.codename}</p>
                <p className="text-xs text-slate-500 mt-1">{p.blurb}</p>
              </div>
              {p.id === "free" ? (
                <p className="flex flex-wrap items-baseline gap-x-1 text-2xl font-extrabold">₦0<span className="whitespace-nowrap text-xs font-normal text-slate-500">/ month</span></p>
              ) : p.audience === "school" ? (
                <div>
                  <p className="flex flex-wrap items-baseline gap-x-1 text-2xl font-extrabold">{naira(p.perSeatTermNgn ?? 1200)}<span className="whitespace-nowrap text-xs font-normal text-slate-500">/ student / semester</span></p>
                  <p className="text-xs text-slate-500">Custom price for a whole department</p>
                </div>
              ) : (
                <div>
                  <p className="flex flex-wrap items-baseline gap-x-1 text-2xl font-extrabold">
                    {naira(term === "month" ? p.priceMonthNgn : p.priceTermNgn)}
                    <span className="whitespace-nowrap text-xs font-normal text-slate-500">/ {term === "month" ? "month" : "semester"}</span>
                  </p>
                  <p className="text-xs text-emerald-600 min-h-4">{term === "term" ? `Save ${termSavingsPercent(p)}% against paying monthly` : `or ${naira(p.priceTermNgn)} for a semester`}</p>
                </div>
              )}
              <ul className="space-y-1.5 text-xs flex-1">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex gap-1.5"><Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-teal-600" /> {perk}</li>
                ))}
              </ul>
              {current ? (
                <p className="text-xs font-bold text-teal-700 dark:text-teal-300">Your current plan</p>
              ) : me.role === "admin" ? (
                <p className="text-xs text-slate-500">Admin accounts are never limited. Give someone this plan from <Link href="/admin/billing" className="underline">Payments &amp; plans</Link>.</p>
              ) : buyable ? (
                me.paymentsReady ? (
                  <Button size="sm" disabled={!!busy} onClick={() => buy(p.id, term)}>
                    {busy === `${p.id}-${term}` ? <Loader2 className="h-4 w-4 animate-spin" /> : `Upgrade to ${p.label}`}
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">Online payment opens soon.</p>
                )
              ) : p.audience === "school" ? (
                <p className="text-xs text-slate-500">Departments and schools: contact us for an invoice and a quote.</p>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card className="p-4 overflow-x-auto">
        <p className="font-bold text-sm mb-2">Compare plans</p>
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-left">
              <th className="py-2 pr-3 font-semibold text-slate-500">Per month</th>
              {shown.map((p) => (
                <th key={p.id} className={cn("py-2 px-2 text-center font-bold", p.id === me.plan.id && "text-teal-700 dark:text-teal-300")}>{p.label}</th>
              ))}
            </tr>
          </thead>
          {MATRIX.map((g) => (
            <tbody key={g.group}>
              <tr><td colSpan={shown.length + 1} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.group}</td></tr>
              {g.rows.filter((r) => shown.some((p) => r.get(p) !== "—")).map((r) => (
                <tr key={r.label} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-1.5 pr-3">{sentence(r.label)}</td>
                  {shown.map((p) => (
                    <td key={p.id} className="py-1.5 px-2 text-center font-mono">{r.get(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p className="text-[11px] text-slate-500 mt-2">Unlimited means fair use, within the AI budget shown. Class lessons, podcasts, quizzes and simulations your teachers publish are free on every plan.</p>
      </Card>
    </div>
  );
}
