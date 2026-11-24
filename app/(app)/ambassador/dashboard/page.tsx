"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

interface Data {
  code: string;
  link: string;
  joined: number;
  paying: number;
  tier: string;
  rate: number;
  nextTier: { name: string; at: number; rate: number } | null;
  minPayoutNgn: number;
  totals: { held: number; payable: number; paid: number; lifetime: number };
  payout: { bankName: string; accountNumber: string; accountName: string } | null;
}
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

export default function AmbassadorDashboard() {
  const { toast } = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [bank, setBank] = useState({ bankName: "", accountNumber: "", accountName: "" });
  const load = useCallback(() => {
    fetch("/api/ambassador").then((r) => r.json()).then((j) => { if (j.ok) { setD(j.data); if (j.data.payout) setBank(j.data.payout); } }).catch(() => null);
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: "Copied", variant: "success" }); } catch { toast({ title: "Copy it by hand", description: text }); }
  };
  const save = async () => {
    const res = await fetch("/api/ambassador", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bank) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return toast({ title: "Couldn't save", description: j?.error?.message, variant: "destructive" });
    toast({ title: "Bank details saved", variant: "success" });
    load();
  };
  if (!d) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const msg = `I study with SunRootLearn: classes for my department, notes read out loud, and quizzes. Try it free for 7 days: ${d.link}`;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ambassador</h1>
      <p className="text-sm text-muted-foreground">Share your link. When someone joins through it and pays, you earn {Math.round(d.rate * 100)}% of their first payment, and 10% of their next six. <Link href="/ambassador" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">How it works</Link></p>
      <Card className="space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your link</p>
        <p className="break-all rounded-lg bg-muted px-3 py-2 text-sm">{d.link}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copy(d.link)}>Copy link</Button>
          <Button size="sm" variant="outline" onClick={() => void copy(msg)}>Copy a message to send</Button>
          <a className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 text-sm font-medium" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Joined", String(d.joined)], ["Paying", String(d.paying)], ["Ready to pay", naira(d.totals.payable)], ["Paid so far", naira(d.totals.paid)]].map(([k, v]) => (
          <Card key={k} className="p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-xl font-semibold">{v}</p></Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Level: <strong>{d.tier}</strong> ({Math.round(d.rate * 100)}%). {d.nextTier ? `${d.nextTier.at - d.paying} more paying student${d.nextTier.at - d.paying === 1 ? "" : "s"} to reach ${d.nextTier.name} (${Math.round(d.nextTier.rate * 100)}%).` : "You are at the top level."}
        {d.totals.held > 0 ? ` ${naira(d.totals.held)} is on a 7-day hold and becomes payable after it.` : ""} Payouts start from {naira(d.minPayoutNgn)}.
      </p>
      <Card className="space-y-3 p-4">
        <p className="font-semibold">Where should we send your money?</p>
        <input className={field} placeholder="Bank name" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} aria-label="Bank name" />
        <input className={field} placeholder="10-digit account number" inputMode="numeric" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} aria-label="Account number" />
        <input className={field} placeholder="Account name" value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} aria-label="Account name" />
        <Button onClick={() => void save()}>Save bank details</Button>
      </Card>
    </div>
  );
}
