"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";

interface Row { uid: string; name: string; email: string; payout: { bankName: string; accountNumber: string; accountName: string } | null; totals: { held: number; payable: number; paid: number } }
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export default function AdminAmbassadors() {
  const user = useUserStore((s) => s.user);
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [min, setMin] = useState(2000);
  const load = useCallback(() => {
    fetch("/api/admin/ambassadors").then((r) => r.json()).then((j) => { if (j.ok) { setRows(asArray<Row>(j.data.ambassadors)); setMin(j.data.minPayoutNgn); } }).catch(() => null);
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  const paid = async (uid: string) => {
    const res = await fetch("/api/admin/ambassadors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "markPaid", uid }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return toast({ title: "Couldn't mark paid", description: j?.error?.message, variant: "destructive" });
    toast({ title: `Marked ${naira(j.data.paid)} as paid`, variant: "success" });
    load();
  };
  if (user && user.role !== "admin") return <p className="text-sm">This page is for admins.</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Ambassador payouts</h1>
      <p className="text-sm text-muted-foreground">Send the money by bank transfer, then press Mark paid. Minimum payout {naira(min)}; earnings are held 7 days first.</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No commissions yet.</p>}
      {rows.map((r) => (
        <Card key={r.uid} className="space-y-2 p-4">
          <p className="font-semibold">{r.name || r.uid} <span className="text-xs font-normal text-muted-foreground">{r.email}</span></p>
          <p className="text-sm">Payable {naira(r.totals.payable)} · held {naira(r.totals.held)} · paid {naira(r.totals.paid)}</p>
          <p className="text-xs text-muted-foreground">{r.payout ? `${r.payout.accountName}, ${r.payout.bankName} ${r.payout.accountNumber}` : "No bank details yet"}</p>
          <Button size="sm" disabled={r.totals.payable < min || !r.payout} onClick={() => void paid(r.uid)}>Mark paid</Button>
        </Card>
      ))}
    </div>
  );
}
