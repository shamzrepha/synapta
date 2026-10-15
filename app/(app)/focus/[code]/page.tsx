"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Play, Square, LogOut, Settings2, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useLiveChannel } from "@/lib/live/client";
import { useNow } from "@/components/game/use-game";
import { asArray } from "@/lib/api/client";
import { timerAt, formatClock } from "@/lib/focus/timer";
import { cn } from "@/lib/utils";

interface Member {
  uid: string;
  displayName: string;
  photoURL: string | null;
  doing: string;
  present: boolean;
  isOwner: boolean;
}
interface RoomState {
  serverNow: number;
  room: { code: string; title: string; ownerUid: string; ownerName: string; focusMin: number; breakMin: number; anchorMs: number | null };
  members: Member[];
  joined: boolean;
  canControl: boolean;
  me: { doing: string } | null;
}

async function post(code: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: RoomState; message?: string; code?: string }> {
  try {
    const res = await fetch(`/api/focus/rooms/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: j.error?.message, code: j.error?.code };
  } catch {
    return { ok: false, message: "Network error" };
  }
}

function Ring({ fraction, phase, children }: { fraction: number; phase: "focus" | "break" | "idle"; children: React.ReactNode }) {
  const r = 88;
  const c = 2 * Math.PI * r;
  const color = phase === "focus" ? "stroke-teal-500" : phase === "break" ? "stroke-amber-500" : "stroke-slate-300 dark:stroke-slate-700";
  return (
    <div className="relative mx-auto w-64 h-64 max-w-full">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-800" />
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={cn("transition-[stroke-dashoffset] duration-300", color)} strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export default function FocusRoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code || "").toUpperCase();
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(250);
  const [state, setState] = useState<RoomState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [doing, setDoing] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const claimed = useRef<Set<string>>(new Set());

  const apply = useCallback((s: RoomState) => {
    setState(s);
    setOffset(s.serverNow - Date.now());
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/focus/rooms/${code}`);
      const j = await res.json();
      if (j.ok) {
        apply(j.data);
        setError(null);
      } else setError(j.error?.message || "Room not found");
    } catch {
      // keep what we have
    }
  }, [code, apply]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  useLiveChannel(`focus:${code}`, load);

  const joined = !!state?.joined;

  // presence heartbeat; also refreshes the member list and clock offset
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(async () => {
      const r = await post(code, { action: "heartbeat" });
      if (r.ok && r.data) apply(r.data);
    }, 30_000);
    return () => clearInterval(t);
  }, [joined, code, apply]);

  const room = state?.room;
  const cfg = room ? { focusMin: room.focusMin, breakMin: room.breakMin } : null;
  const serverNow = now + offset;
  const t = room && cfg && room.anchorMs ? timerAt(room.anchorMs, cfg, serverNow) : null;

  // claim a finished focus block exactly once per (anchor, block)
  const finishedBlock = t ? (t.phase === "break" ? t.block : t.block - 1) : -1;
  const anchor = room?.anchorMs ?? null;
  useEffect(() => {
    if (!joined || anchor == null || finishedBlock < 0) return;
    const key = `${anchor}:${finishedBlock}`;
    if (claimed.current.has(key)) return;
    claimed.current.add(key);
    fetch(`/api/focus/rooms/${code}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ block: finishedBlock }) })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && !j.data.alreadyClaimed) {
          toast({
            title: j.data.xp > 0 ? `Focus block complete +${j.data.xp} XP` : "Focus block complete",
            description: j.data.streak > 0 ? `${j.data.streak}-day focus streak` : undefined,
            variant: "success",
          });
        }
      })
      .catch(() => null);
  }, [joined, anchor, finishedBlock, code, toast]);

  const join = async () => {
    setBusy(true);
    const r = await post(code, { action: "join", doing: doing.trim() });
    setBusy(false);
    if (r.ok && r.data) apply(r.data);
    else toast({ title: "Couldn't join", description: r.message, variant: "destructive" });
  };

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await post(code, body);
    setBusy(false);
    if (r.ok && r.data) apply(r.data);
    else toast({ title: "Action failed", description: r.message, variant: "destructive" });
    return r.ok;
  };

  const leave = async () => {
    await post(code, { action: "leave" });
    router.push("/focus");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/focus/${code}`);
      toast({ title: "Invite link copied", variant: "success" });
    } catch {
      toast({ title: "Copy failed", description: `Share the code ${code}`, variant: "destructive" });
    }
  };

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-0 space-y-3">
        <Link href="/focus" className="inline-flex items-center gap-1 text-sm text-slate-500 min-h-9">
          <ArrowLeft className="h-4 w-4" /> Focus rooms
        </Link>
        <Card className="p-5 text-center text-sm text-slate-500">{error}</Card>
      </div>
    );
  }
  if (!state || !room || !cfg) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-0">
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const members = asArray<Member>(state.members).slice().sort((a, b) => Number(b.present) - Number(a.present));
  const phase = t ? t.phase : "idle";

  return (
    <div className="max-w-xl mx-auto space-y-4 px-4 sm:px-0 pb-8">
      <div className="flex items-center justify-between gap-2">
        <Link href="/focus" className="inline-flex items-center gap-1 text-sm text-slate-500 min-h-9">
          <ArrowLeft className="h-4 w-4" /> Focus rooms
        </Link>
        <Link href="/focus/stats" className="text-sm text-teal-700 dark:text-teal-400 min-h-9 inline-flex items-center">
          My stats
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-extrabold tracking-tight">{room.title}</h1>
        <p className="text-xs text-slate-500">
          Code <span className="font-mono font-bold tracking-widest">{room.code}</span> · {room.focusMin}/{room.breakMin} min · silent room, no chat
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <Ring fraction={t ? t.remainingMs / t.totalMs : 0} phase={phase}>
          {t ? (
            <>
              <p className={cn("text-xs font-bold uppercase tracking-wider", phase === "focus" ? "text-teal-600" : "text-amber-600")}>{phase === "focus" ? "Focus" : "Break"}</p>
              <p className="text-5xl font-extrabold tabular-nums" aria-live="off">
                {formatClock(t.remainingMs)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Block {t.block + 1}</p>
            </>
          ) : (
            <>
              <p className="text-4xl font-extrabold tabular-nums text-slate-400">{formatClock(room.focusMin * 60_000)}</p>
              <p className="text-xs text-slate-500 mt-1 px-6 text-center">Waiting for the host to start</p>
            </>
          )}
        </Ring>

        {state.joined ? (
          <>
            {state.canControl && (
              <div className="flex items-center justify-center gap-2">
                {room.anchorMs ? (
                  <Button variant="outline" onClick={() => act({ action: "stop" })} isLoading={busy} className="min-h-11">
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                ) : (
                  <Button onClick={() => act({ action: "start" })} isLoading={busy} className="min-h-11">
                    <Play className="h-4 w-4 mr-1" /> Start timer
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFocusMin(room.focusMin);
                    setBreakMin(room.breakMin);
                    setShowSettings((v) => !v);
                  }}
                  className="min-h-11"
                  aria-label="Timer settings"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
            )}
            {showSettings && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="text-xs text-slate-500 space-y-1">
                  Focus (min)
                  <Input type="number" inputMode="numeric" min={5} max={90} value={focusMin} onChange={(e) => setFocusMin(Number(e.target.value))} />
                </label>
                <label className="text-xs text-slate-500 space-y-1">
                  Break (min)
                  <Input type="number" inputMode="numeric" min={1} max={30} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
                </label>
                <Button
                  className="col-span-2 min-h-11"
                  isLoading={busy}
                  onClick={async () => {
                    if (await act({ action: "settings", focusMin, breakMin })) setShowSettings(false);
                  }}
                >
                  Save (stops the timer)
                </Button>
              </div>
            )}
            {!state.canControl && !room.anchorMs && <p className="text-center text-xs text-slate-500">{room.ownerName} controls the timer.</p>}
            <div className="flex gap-2">
              <Input
                value={doing}
                onChange={(e) => setDoing(e.target.value)}
                onBlur={() => post(code, { action: "heartbeat", doing: doing.trim() }).then((r) => r.ok && r.data && apply(r.data))}
                placeholder={state.me?.doing ? `Working on: ${state.me.doing}` : "What I'm working on (optional)"}
                maxLength={80}
              />
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={copyLink} className="min-h-9">
                <Copy className="h-4 w-4 mr-1" /> Copy invite link
              </Button>
              <Button variant="ghost" size="sm" onClick={leave} className="min-h-9 text-slate-500">
                <LogOut className="h-4 w-4 mr-1" /> Leave
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <Input value={doing} onChange={(e) => setDoing(e.target.value)} placeholder="What I'm working on (optional)" maxLength={80} />
            <Button className="w-full min-h-11" onClick={join} isLoading={busy}>
              Join room
            </Button>
            <p className="text-[11px] text-center text-slate-500">Join before a focus block starts to earn XP for it.</p>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <p className="font-bold text-sm flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" /> Focusing now ({members.filter((m) => m.present).length})
        </p>
        {members.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody here yet.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.uid} className={cn("flex items-center gap-3", !m.present && "opacity-50")}>
                <span className="relative">
                  <Avatar name={m.displayName} photoURL={m.photoURL} seed={m.uid} size={32} />
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900", m.present ? "bg-emerald-500" : "bg-slate-400")} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">
                    {m.displayName}
                    {m.isOwner && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">host</span>}
                  </span>
                  {m.doing && <span className="block text-xs text-slate-500 truncate">{m.doing}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
