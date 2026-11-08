"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchJson } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface State {
  mode: "off" | "testers" | "all";
  testers: Array<{ uid: string; email: string; name: string }>;
  saved: boolean;
  envOn: boolean;
  paymentsReady: boolean;
}

const MODES: Array<{ id: State["mode"]; label: string; hint: string }> = [
  { id: "off", label: "Off", hint: "Nobody is limited. Usage is still counted." },
  { id: "testers", label: "Test accounts only", hint: "Only the accounts below hit limits, see the upgrade pop-up and can pay. Everyone else is untouched." },
  { id: "all", label: "Everyone", hint: "Every user is limited by their plan. Free users see the upgrade pop-up." },
];

/** The admin's on/off switch for plan limits, plus the list of test accounts to try payments with. */
export function EnforcementPanel() {
  const { toast } = useToast();
  const [s, setS] = useState<State | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await fetchJson<State>("/api/admin/billing/config");
    if (j.ok) setS(j.data);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    const j = await fetchJson<State>("/api/admin/billing/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (j.ok) {
      setS(j.data);
      setEmail("");
    } else toast({ title: "Couldn't save", description: j.error.message, variant: "destructive" });
  };

  if (!s) return null;
  return (
    <Card className="p-4 space-y-3 border-amber-500/40">
      <div>
        <p className="font-bold text-sm">Plan limits and payments</p>
        <p className="text-xs text-slate-500">
          Take effect within about 10 seconds. {s.saved ? "Set from here." : `Not set here yet, so the BILLING_ENFORCED setting decides (${s.envOn ? "on" : "off"}).`}
          {!s.paymentsReady && " Payments can't be taken yet: the Paystack key isn't added."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Who is limited">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={s.mode === m.id} disabled={busy} onClick={() => save({ mode: m.id })} className={cn("rounded-xl border p-3 text-left", s.mode === m.id ? "border-brand-600 bg-brand-500/10" : "border-slate-300 dark:border-slate-700 hover:border-brand-500")}>
            <p className="text-sm font-bold">{m.label}</p>
            <p className="text-[11px] text-slate-500">{m.hint}</p>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold">Test accounts</p>
        {s.testers.length === 0 && <p className="text-xs text-slate-500">None yet. Add your dummy account&apos;s email.</p>}
        <ul className="space-y-1">
          {s.testers.map((t) => (
            <li key={t.uid} className="flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate"><b>{t.name || "Unnamed"}</b> {t.email}</span>
              <button type="button" disabled={busy} onClick={() => save({ removeUid: t.uid })} className="text-rose-600 underline">Remove</button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) void save({ addEmail: email.trim() }); }} className="flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dummy account email" className="flex-1 min-w-0 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm" />
          <Button size="sm" disabled={busy}>Add</Button>
        </form>
      </div>
    </Card>
  );
}
