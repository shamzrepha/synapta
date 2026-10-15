"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { ReportView } from "@/components/report/report-view";
import type { ReportNumbers } from "@/lib/report/compute";

interface Narrative {
  summary: string;
  suggestion: string;
}
interface Share {
  token: string;
  to: string;
  createdAt: string | null;
}

export default function ReportPage() {
  const { toast } = useToast();
  const [numbers, setNumbers] = useState<ReportNumbers | null>(null);
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [writing, setWriting] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/report")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        setNumbers(json.data.numbers);
        setNarrative(json.data.narrative);
      })
      .catch(() => null);
    fetch("/api/report/share")
      .then((r) => r.json())
      .then((json) => !cancelled && json.ok && setShares(asArray<Share>(json.data.shares)))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  async function write() {
    setWriting(true);
    try {
      const json = await (await fetch("/api/report", { method: "POST" })).json();
      if (json.ok) {
        setNumbers(json.data.numbers);
        setNarrative(json.data.narrative);
      } else toast({ title: "Couldn't write the summary", description: json.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setWriting(false);
    }
  }

  async function share() {
    setSharing(true);
    try {
      const json = await (await fetch("/api/report/share", { method: "POST" })).json();
      if (json.ok) {
        const url = `${window.location.origin}${json.data.path}`;
        setShares((cur) => [{ token: json.data.token, to: numbers?.to || "", createdAt: new Date().toISOString() }, ...cur]);
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: "Link copied", description: "Anyone with the link can view this report until you revoke it.", variant: "success" });
        } catch {
          toast({ title: "Link created", description: url, variant: "success" });
        }
      } else toast({ title: "Couldn't create link", description: json.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function revoke(token: string) {
    try {
      const json = await (await fetch(`/api/report/share?token=${token}`, { method: "DELETE" })).json();
      if (json.ok) setShares((cur) => cur.filter((s) => s.token !== token));
      else toast({ title: "Couldn't revoke", description: json.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Weekly report card</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your last 7 days, ready to share with a parent or teacher.</p>
      </div>

      {!numbers ? <div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" /> : <ReportView numbers={numbers} summary={narrative?.summary} suggestion={narrative?.suggestion} />}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={write} isLoading={writing} disabled={!numbers || writing}>
          {narrative ? "Rewrite summary" : "Write my summary"}
        </Button>
        <Button onClick={share} isLoading={sharing} disabled={!numbers || sharing}>
          Create share link
        </Button>
      </div>

      {shares.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Active links</h2>
          <Card className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
            {shares.map((s) => (
              <div key={s.token} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-xs font-mono">/r/{s.token.slice(0, 8)}… {s.createdAt ? `· ${new Date(s.createdAt).toLocaleDateString()}` : ""}</span>
                <Button size="sm" variant="outline" onClick={() => revoke(s.token)}>Revoke</Button>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
