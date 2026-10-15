"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Flame, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";

interface GroupRow {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isOwner: boolean;
  streak: number;
  activeToday: boolean;
}

export default function GroupsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const autoJoined = useRef(false);

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/groups")).json();
      setGroups(asArray<GroupRow>(j.ok ? j.data.groups : []));
    } catch {
      setGroups([]);
    }
  }, []);

  const joinWith = useCallback(
    async (c: string) => {
      setBusy(true);
      try {
        const j = await (await fetch("/api/groups/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c }) })).json();
        if (j.ok) {
          toast({ title: `Joined ${j.data.name}`, variant: "success" });
          router.push(`/groups/${j.data.id}`);
        } else toast({ title: "Couldn't join", description: j.error?.message, variant: "destructive" });
      } finally {
        setBusy(false);
      }
    },
    [router, toast]
  );

  useEffect(() => {
    // all state updates happen in async callbacks
    const t = setTimeout(() => {
      void load();
      const c = new URLSearchParams(window.location.search).get("join");
      if (c && !autoJoined.current) {
        autoJoined.current = true;
        void joinWith(c);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [load, joinWith]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const j = await (await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description }) })).json();
      if (j.ok) router.push(`/groups/${j.data.id}`);
      else toast({ title: "Couldn't create group", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 px-4 sm:px-0 pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Users className="h-7 w-7 text-teal-600" /> Study groups
        </h1>
        <p className="text-sm text-slate-500">Shared notes, goals and a streak you keep alive together.</p>
      </div>

      {groups === null ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : groups.length === 0 ? (
        <Card className="p-4 text-sm text-slate-500">You&apos;re not in a group yet. Create one or paste an invite code below.</Card>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="block">
              <Card className="p-4 flex items-center gap-3 hover:border-teal-500/50">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{g.name}</p>
                  <p className="text-xs text-slate-500">
                    {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                    {g.isOwner ? " · owner" : ""}
                  </p>
                </div>
                <span className={g.streak > 0 ? "inline-flex items-center gap-1 text-sm font-bold text-orange-500" : "inline-flex items-center gap-1 text-sm text-slate-400"}>
                  <Flame className="h-4 w-4" /> {g.streak}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <form onSubmit={create} className="space-y-3">
          <p className="font-bold">Create a group</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" required minLength={2} maxLength={60} />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you studying? (optional)" maxLength={300} />
          <Button type="submit" isLoading={busy} className="w-full min-h-11">
            Create group
          </Button>
        </form>
      </Card>

      <Card className="p-4 sm:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void joinWith(code.trim());
          }}
          className="space-y-3"
        >
          <p className="font-bold">Have an invite code?</p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="8-character code" maxLength={12} className="font-mono tracking-widest" />
            <Button type="submit" variant="outline" className="min-h-11 shrink-0" disabled={busy}>
              Join
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
