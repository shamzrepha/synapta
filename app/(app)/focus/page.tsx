"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Timer, BarChart3, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { normalizeCode } from "@/lib/focus/timer";

interface MyRoom {
  code: string;
  title: string;
  focusMin: number;
  breakMin: number;
}

export default function FocusHomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<MyRoom[]>([]);
  const [title, setTitle] = useState("");
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/focus/rooms")
      .then((r) => r.json())
      .then((j) => setRooms(asArray<MyRoom>(j.ok ? j.data.rooms : [])))
      .catch(() => null);
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/focus/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, focusMin, breakMin }),
      });
      const j = await res.json();
      if (j.ok) router.push(`/focus/${j.data.code}`);
      else toast({ title: "Couldn't create room", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!c) {
      toast({ title: "Check the code", description: "Room codes have 6 letters or digits.", variant: "destructive" });
      return;
    }
    router.push(`/focus/${c}`);
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 px-4 sm:px-0 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Timer className="h-7 w-7 text-teal-600" /> Focus rooms
          </h1>
          <p className="text-sm text-slate-500">Study silently together on a shared Pomodoro clock. Finish a block to earn XP and keep your streak.</p>
        </div>
        <Link href="/focus/stats" className="shrink-0 inline-flex items-center gap-1 min-h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-medium">
          <BarChart3 className="h-4 w-4" /> Stats
        </Link>
      </div>

      <Card className="p-4 sm:p-5">
        <form onSubmit={create} className="space-y-3">
          <p className="font-bold">Start a room</p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Room name (optional)" maxLength={60} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500 space-y-1">
              Focus (minutes)
              <Input type="number" inputMode="numeric" min={5} max={90} value={focusMin} onChange={(e) => setFocusMin(Number(e.target.value))} />
            </label>
            <label className="text-xs text-slate-500 space-y-1">
              Break (minutes)
              <Input type="number" inputMode="numeric" min={1} max={30} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
            </label>
          </div>
          <Button type="submit" isLoading={busy} className="w-full min-h-11">
            Create room
          </Button>
        </form>
      </Card>

      <Card className="p-4 sm:p-5">
        <form onSubmit={join} className="space-y-3">
          <p className="font-bold">Join with a code</p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC234" maxLength={10} className="uppercase tracking-widest font-mono" />
            <Button type="submit" variant="outline" className="min-h-11 shrink-0">
              Join
            </Button>
          </div>
        </form>
      </Card>

      {rooms.length > 0 && (
        <Card className="p-4 sm:p-5 space-y-2">
          <p className="font-bold">Your rooms</p>
          {asArray(rooms).map((r) => (
            <Link key={r.code} href={`/focus/${r.code}`} className="flex items-center justify-between gap-2 min-h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{r.title}</span>
                <span className="block text-xs text-slate-500">
                  {r.code} · {r.focusMin}/{r.breakMin} min
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
