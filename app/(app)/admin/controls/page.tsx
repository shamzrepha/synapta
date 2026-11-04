"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Megaphone, PauseCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserStore } from "@/lib/store/use-user-store";
import { fetchJson } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Site {
  aiPaused: boolean;
  aiPausedMessage: string;
  notice: { text: string; level: "info" | "warning" } | null;
}

/** Site-wide switches: the AI kill switch and a notice for everyone. */
export default function AdminControlsPage() {
  const { user } = useUserStore();
  const { toast } = useToast();
  const [site, setSite] = useState<Site | null>(null);
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"info" | "warning">("info");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = (s: Site) => {
    setSite(s);
    setText(s.notice?.text ?? "");
    setLevel(s.notice?.level ?? "info");
    setMsg(s.aiPausedMessage);
  };

  const load = useCallback(async () => {
    const r = await fetchJson<Site>("/api/admin/site");
    if (r.ok) apply(r.data);
    else toast({ title: "Couldn't load", description: r.error.message, variant: "destructive" });
  }, [toast]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [user?.role, load]);

  const save = async (patch: Record<string, unknown>, done: string) => {
    setBusy(true);
    const r = await fetchJson<Site>("/api/admin/site", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(false);
    if (r.ok) {
      apply(r.data);
      toast({ title: done });
    } else toast({ title: "Couldn't save", description: r.error.message, variant: "destructive" });
  };

  if (user && user.role !== "admin") return <p className="p-6 text-sm text-slate-500">This page is for admins.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/admin" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
        <h1 className="text-xl font-extrabold">Site controls</h1>
        <p className="text-sm text-slate-500">Changes apply within about 10 seconds, with no redeploy. Every change is written to the audit log.</p>
      </div>

      {!site ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card className={`space-y-3 p-4 ${site.aiPaused ? "border-amber-400/60" : ""}`}>
            <div className="flex items-start gap-3">
              <PauseCircle className={`mt-0.5 h-5 w-5 shrink-0 ${site.aiPaused ? "text-amber-500" : "text-slate-400"}`} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">AI kill switch: {site.aiPaused ? "AI is PAUSED" : "AI is on"}</p>
                <p className="text-xs text-slate-500">
                  Pausing stops every AI feature for students and teachers straight away (a runaway bill, a bad key, an outage). Reading saved notes, flashcards and
                  classes keeps working. Admin health checks still run.
                </p>
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              What people see when they try an AI feature while it is paused
              <input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={240} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900" />
            </label>
            <div className="flex flex-wrap gap-2">
              {site.aiPaused ? (
                <Button size="sm" isLoading={busy} onClick={() => save({ aiPaused: false, aiPausedMessage: msg }, "AI is back on")}>
                  Turn AI back on
                </Button>
              ) : (
                <Button size="sm" variant="outline" isLoading={busy} onClick={() => confirm("Pause AI for everyone now?") && save({ aiPaused: true, aiPausedMessage: msg }, "AI paused")}>
                  Pause AI for everyone
                </Button>
              )}
              <Button size="sm" variant="outline" isLoading={busy} onClick={() => save({ aiPausedMessage: msg }, "Message saved")}>
                Save message
              </Button>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Notice for everyone</p>
                <p className="text-xs text-slate-500">A short banner at the top of the app: planned maintenance, an outage, good news. Leave it empty to hide it.</p>
              </div>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={240} rows={2} placeholder="e.g. Sunroot will be down for a few minutes tonight at 11pm." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900" />
            <div className="flex flex-wrap items-center gap-2">
              <select value={level} onChange={(e) => setLevel(e.target.value as "info" | "warning")} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Notice style">
                <option value="info">Information (green)</option>
                <option value="warning">Warning (amber)</option>
              </select>
              <Button size="sm" isLoading={busy} onClick={() => save({ noticeText: text, noticeLevel: level }, text.trim() ? "Notice is live" : "Notice removed")}>
                {text.trim() ? "Publish notice" : "Remove notice"}
              </Button>
              <span className="text-[11px] text-slate-400">{text.length}/240</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
