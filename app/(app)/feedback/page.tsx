"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABEL, rewardLabel, type RewardKind } from "@/lib/feedback/rewards";

interface Mine { id: string; kind: string; message: string; status: string; note: string; reward: { kind: RewardKind; amount: number } | null; createdAt: string }
const KINDS = [
  { id: "idea", label: "An idea", hint: "Something you wish Sunroot did" },
  { id: "bug", label: "A bug", hint: "Something that is broken or confusing" },
  { id: "praise", label: "A kind word", hint: "What is working for you" },
  { id: "other", label: "Something else", hint: "Anything at all" },
];

export default function FeedbackPage() {
  const { toast } = useToast();
  const [kind, setKind] = useState("idea");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/feedback").then((r) => r.json()).then((j) => setMine(j.ok ? asArray<Mine>(j.data.items) : [])).catch(() => setMine([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, message, page: typeof window !== "undefined" ? document.referrer.replace(window.location.origin, "").slice(0, 200) : "" }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return toast({ title: "Couldn't send that", description: j?.error?.message || "Try again.", variant: "destructive" });
      setMessage("");
      toast({ title: "Sent. Thank you.", description: "The founder reads every message.", variant: "success" });
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">Feedback</p>
        <h1 className="text-2xl font-semibold tracking-tight">Help us build Sunroot</h1>
        <p className="text-sm text-muted-foreground">Every message goes straight to the founder. The best ideas and the bugs you find get built, and the people behind them get rewarded.</p>
      </div>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="What are you sending?">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={`min-h-[56px] rounded-lg border p-2 text-left ${kind === k.id ? "border-brand-600 bg-brand-600/10" : "border-border hover:bg-muted/60"}`}>
              <span className="block text-sm font-semibold">{k.label}</span>
              <span className="block text-xs text-muted-foreground">{k.hint}</span>
            </button>
          ))}
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={2000} placeholder={kind === "bug" ? "What did you tap, and what happened? Which page?" : "Tell us in your own words"} aria-label="Your message" className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
        <Button className="w-full min-h-[48px]" disabled={message.trim().length < 5} isLoading={busy} onClick={() => void send()}>Send</Button>
      </Card>

      <section aria-label="What you sent" className="space-y-2">
        <h2 className="text-sm font-semibold">What you sent</h2>
        {mine === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {mine?.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        {mine?.map((m) => (
          <Card key={m.id} className="space-y-1 p-3">
            <div className="flex items-center justify-between gap-2 text-xs"><span className="font-mono uppercase tracking-wide text-muted-foreground">{m.kind}</span><span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{STATUS_LABEL[m.status] ?? m.status}</span></div>
            <p className="whitespace-pre-wrap break-words text-sm">{m.message}</p>
            {m.note && <p className="text-xs text-muted-foreground">Reply: {m.note}</p>}
            {m.reward && <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><Gift className="h-3.5 w-3.5" aria-hidden="true" /> Thank you gift: {rewardLabel(m.reward.kind, m.reward.amount)}</p>}
          </Card>
        ))}
      </section>
    </div>
  );
}
