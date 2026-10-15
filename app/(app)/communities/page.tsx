"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { KINDS } from "@/lib/communities/rules";
import { cn } from "@/lib/utils";

interface Community {
  id: string;
  name: string;
  kind: string;
  description: string;
  memberCount: number;
  role: string | null;
}

function Row({ c }: { c: Community }) {
  return (
    <Link href={`/communities/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600">
        <Building2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{c.name}</p>
        <p className="text-xs capitalize text-slate-500">
          {c.kind} · {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
          {c.role === "owner" ? " · you own this" : ""}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </Link>
  );
}

export default function CommunitiesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [mine, setMine] = useState<Community[]>([]);
  const [discover, setDiscover] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", kind: "school", joinMode: "open" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/communities")
      .then((r) => r.json())
      .then((j) => {
        if (ignore) return;
        if (j.ok) {
          setMine(asArray<Community>(j.data.mine));
          setDiscover(asArray<Community>(j.data.discover));
        }
        setLoading(false);
      })
      .catch(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, []);

  const joinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    const j = await fetch("/api/communities/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => r.json()).catch(() => null);
    setJoining(false);
    if (j?.ok) router.push(`/communities/${j.data.id}`);
    else toast({ title: "Couldn't join", description: j?.error?.message, variant: "destructive" });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const j = await fetch("/api/communities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (j?.ok) router.push(`/communities/${j.data.id}`);
    else toast({ title: "Couldn't create", description: j?.error?.message, variant: "destructive" });
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
            <Building2 className="h-7 w-7 text-teal-600" /> Communities
          </h1>
          <p className="text-sm text-slate-500">A feed for your school, campus or club.</p>
        </div>
        <Button size="sm" onClick={() => setCreating((c) => !c)}>
          <Plus className="mr-1 h-4 w-4" /> Create
        </Button>
      </div>

      {creating && (
        <form onSubmit={create} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. Northside High" maxLength={60} />
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is it about? (optional)" maxLength={300} />
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} className={cn("h-9 rounded-xl px-3 text-sm font-semibold capitalize", form.kind === k ? "bg-teal-600 text-white" : "border border-slate-200 dark:border-slate-700")}>
                {k}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["open", "code"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setForm({ ...form, joinMode: m })} className={cn("h-9 rounded-xl px-3 text-sm font-semibold", form.joinMode === m ? "bg-teal-600 text-white" : "border border-slate-200 dark:border-slate-700")}>
                {m === "open" ? "Anyone can join" : "Join code only"}
              </button>
            ))}
          </div>
          <Button type="submit" size="sm" isLoading={saving} disabled={form.name.trim().length < 3}>
            Create community
          </Button>
        </form>
      )}

      <form onSubmit={joinByCode} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Have a join code?" maxLength={12} className="font-mono uppercase" />
        <Button type="submit" variant="outline" isLoading={joining} disabled={code.trim().length < 4}>
          Join
        </Button>
      </form>

      {loading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-bold">Your communities</h2>
            {mine.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-500">You haven&apos;t joined any yet.</Card>
            ) : (
              <Card className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
                {mine.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </Card>
            )}
          </section>
          {discover.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold">Open to join</h2>
              <Card className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
                {discover.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
