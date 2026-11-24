"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";

interface Where { institution: string; school: string; department: string; level: number }
interface Req { uid: string; email: string; from: Where; to: Where; reason: string; createdAt: string }
const line = (w: Where) => `${w.institution}${w.school ? " · " + w.school : ""} · ${w.department} · ${w.level} level`;

export default function AcademicRequestsPage() {
  const user = useUserStore((s) => s.user);
  const { toast } = useToast();
  const [items, setItems] = useState<Req[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/admin/academic-requests").then((r) => r.json()).then((j) => setItems(j.ok ? asArray<Req>(j.data.items) : [])).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const decide = async (uid: string, action: "approve" | "decline") => {
    const res = await fetch(`/api/admin/academic-requests/${uid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return toast({ title: "Couldn't do that", description: j?.error?.message, variant: "destructive" });
    load();
  };
  if (user && user.role !== "admin") return <p className="text-sm">This page is for admins.</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Course change requests</h1>
      <p className="text-sm text-muted-foreground">Students lock their school, department and level when they sign up. They ask here to change it.</p>
      {items === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {items?.length === 0 && <Card className="p-5 text-sm text-muted-foreground">Nothing is waiting.</Card>}
      {items?.map((r) => (
        <Card key={r.uid} className="space-y-2 p-4">
          <p className="text-sm font-semibold">{r.email || r.uid}</p>
          <p className="text-xs text-muted-foreground">From: {line(r.from)}</p>
          <p className="text-sm">To: {line(r.to)}</p>
          <p className="text-sm text-muted-foreground">&ldquo;{r.reason}&rdquo;</p>
          <div className="flex gap-2"><Button size="sm" onClick={() => void decide(r.uid, "approve")}>Approve</Button><Button size="sm" variant="outline" onClick={() => void decide(r.uid, "decline")}>Decline</Button></div>
        </Card>
      ))}
    </div>
  );
}
