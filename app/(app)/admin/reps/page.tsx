"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";

interface Rep { uid: string; name: string; email: string; rep: { institution: string; department: string } | null }
interface Found { uid: string; name: string; email: string; institution: string; department: string; rep: { institution: string; department: string } | null }
interface School { id: string; name: string; departments: string[] }
interface Inst { id: string; name: string; schools: School[] }
const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

export default function RepsPage() {
  const user = useUserStore((s) => s.user);
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found | null | undefined>(undefined);
  const [reps, setReps] = useState<Rep[]>([]);
  const [insts, setInsts] = useState<Inst[]>([]);
  const [instId, setInstId] = useState("futo");
  const [dept, setDept] = useState("");
  const load = useCallback(() => {
    fetch("/api/admin/reps").then((r) => r.json()).then((j) => j.ok && setReps(asArray<Rep>(j.data.reps))).catch(() => null);
  }, []);
  useEffect(() => {
    load();
    fetch("/api/profile/academic").then((r) => r.json()).then((j) => j.ok && setInsts(asArray<Inst>(j.data.institutions))).catch(() => null);
  }, [load]);
  const inst = insts.find((i) => i.id === instId);
  const departments = (inst?.schools ?? []).flatMap((s) => s.departments).sort();

  const look = async () => {
    const r = await fetch(`/api/admin/reps?lookup=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => null);
    setFound(r?.ok ? r.data.user : null);
  };
  const act = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/reps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return toast({ title: "Couldn't do that", description: j?.error?.message, variant: "destructive" });
    toast({ title: "Done", variant: "success" });
    setFound(undefined);
    setQ("");
    load();
  };
  if (user && user.role !== "admin") return <p className="text-sm">This page is for admins.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Course reps</h1>
      <p className="text-sm text-muted-foreground">A rep can add materials to one department&apos;s library. Paste the user ID (or email) they sent you.</p>
      <div className="flex gap-2">
        <input className={field} placeholder="User ID or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="User ID or email" />
        <Button onClick={() => void look()} disabled={!q.trim()}>Find</Button>
      </div>
      {found === null && <p className="text-sm text-rose-600">No one found with that.</p>}
      {found && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-semibold">{found.name || found.uid}{found.email ? ` · ${found.email}` : ""}</p>
          <p className="text-xs text-muted-foreground">{found.institution} {found.department ? `· ${found.department}` : ""}</p>
          <select className={field} value={instId} onChange={(e) => { setInstId(e.target.value); setDept(""); }} aria-label="School">{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <select className={field} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">Department</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          <Button disabled={!dept} onClick={() => void act({ action: "grant", uid: found.uid, institutionId: instId, department: dept })}>Make course rep</Button>
        </Card>
      )}
      <h2 className="text-sm font-semibold">Current reps</h2>
      {reps.length === 0 && <Card className="p-4 text-sm text-muted-foreground">None yet.</Card>}
      {reps.map((r) => (
        <Card key={r.uid} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.name || r.uid}</p><p className="truncate text-xs text-muted-foreground">{r.rep?.department} · {r.rep?.institution}</p></div>
          <Button size="sm" variant="outline" onClick={() => void act({ action: "revoke", uid: r.uid })}>Remove</Button>
        </Card>
      ))}
    </div>
  );
}
