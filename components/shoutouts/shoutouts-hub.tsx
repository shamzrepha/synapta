"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, timeAgo } from "@/lib/community/client";
import { SHOUTOUT_BADGES, SHOUTOUT_LIMITS, type ShoutoutBadge } from "@/lib/shoutouts/rules";
import { cn } from "@/lib/utils";

interface UserLite { uid: string; username: string; displayName: string; photoURL: string | null }
interface Item {
  id: string;
  emoji: string;
  badgeLabel: string;
  message: string;
  from: { uid: string; displayName: string; photoURL: string | null };
  to: { uid: string; displayName: string; photoURL: string | null };
  createdAt: string | null;
}

function UserPicker({ value, onPick }: { value: UserLite | null; onPick: (u: UserLite | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const d = await api<{ users: UserLite[] }>(`/api/mentions/users?q=${encodeURIComponent(q)}`);
        if (my === seq.current) setResults(asArray<UserLite>(d.users));
      } catch {
        if (my === seq.current) setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 p-2 dark:border-slate-700">
        <Avatar name={value.displayName} photoURL={value.photoURL} size={32} />
        <span className="text-sm font-semibold">{value.displayName}</span>
        <span className="text-xs text-slate-500">@{value.username}</span>
        <button type="button" onClick={() => onPick(null)} className="ml-auto flex h-9 w-9 items-center justify-center" aria-label="Change person"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person by name or @username" />
      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
          {results.map((u) => (
            <li key={u.uid}>
              <button type="button" onClick={() => onPick(u)} className="flex min-h-[44px] w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
                <Avatar name={u.displayName} photoURL={u.photoURL} size={28} />
                <span className="text-sm">{u.displayName}</span>
                <span className="text-xs text-slate-500">@{u.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShoutoutsHub({ initialTab }: { initialTab?: string | null }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"send" | "received" | "sent">(initialTab === "received" || initialTab === "sent" ? initialTab : "send");
  const [items, setItems] = useState<Item[] | null>(null);
  const [to, setTo] = useState<UserLite | null>(null);
  const [badge, setBadge] = useState<ShoutoutBadge>("thanks");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (tab === "send") return;
    try {
      const d = await api<{ shoutouts: Item[] }>(`/api/shoutouts?view=${tab}`);
      setItems(asArray<Item>(d.shoutouts));
    } catch {
      setItems([]);
    }
  }, [tab]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const send = async () => {
    if (!to) return;
    setBusy(true);
    try {
      await api("/api/shoutouts", "POST", { toUid: to.uid, badge, message });
      toast({ title: `Shout-out sent to ${to.displayName}`, variant: "success" });
      setTo(null);
      setMessage("");
    } catch (e) {
      toast({ title: "Couldn't send", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold">Shout-outs 💌</h1>
        <p className="text-sm text-slate-500">Thank someone who helped you. You can send up to {SHOUTOUT_LIMITS.perDay} a day.</p>
      </div>
      <div className="flex gap-2">
        {([["send", "Send"], ["received", "Received"], ["sent", "Sent"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setTab(id); setItems(null); }} className={cn("min-h-[36px] rounded-full border px-3.5 text-xs font-semibold", tab === id ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-700")}>{label}</button>
        ))}
      </div>

      {tab === "send" && (
        <Card className="space-y-3 p-4">
          <UserPicker value={to} onPick={setTo} />
          <div className="grid grid-cols-2 gap-2">
            {SHOUTOUT_BADGES.map((b) => (
              <button key={b.id} type="button" onClick={() => setBadge(b.id)} className={cn("flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-medium", badge === b.id ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40" : "border-slate-300 dark:border-slate-700")}>
                <span className="text-lg">{b.emoji}</span> {b.label}
              </button>
            ))}
          </div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={SHOUTOUT_LIMITS.message} rows={3} placeholder="Say what they did that helped…" />
          <Button onClick={send} isLoading={busy} disabled={!to || message.trim().length < 2}>Send shout-out</Button>
        </Card>
      )}

      {tab !== "send" && (
        <>
          {items === null && <Skeleton className="h-20 w-full rounded-2xl" />}
          {items && items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{tab === "received" ? "No shout-outs yet. Help someone and they might thank you." : "You haven't sent any yet."}</p>}
          {items?.map((s) => {
            const other = tab === "received" ? s.from : s.to;
            return (
              <Card key={s.id} className="flex gap-3 p-4">
                <Avatar name={other.displayName} photoURL={other.photoURL} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-semibold">{tab === "received" ? other.displayName : `To ${other.displayName}`}</span> <span className="text-slate-500">· {timeAgo(s.createdAt)}</span></p>
                  <p className="mt-0.5 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{s.emoji} {s.badgeLabel}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{s.message}</p>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
