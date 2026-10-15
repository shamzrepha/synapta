"use client";

import React, { useState } from "react";
import { CalendarDays, Check, HelpCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface RsvpSession {
  id: string;
  going: boolean;
  maybe?: boolean;
  rsvpCount: number;
  maybeCount?: number;
  isHost: boolean;
  status: "upcoming" | "starting_soon" | "live" | "ended";
}

export type RsvpPatch = { going: boolean; maybe: boolean; rsvpCount: number; maybeCount: number };

/** Going / Maybe buttons (optimistic) plus an "add to calendar" .ics link. */
export function RsvpButtons({ s, onChange }: { s: RsvpSession; onChange: (patch: RsvpPatch) => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (status: "going" | "maybe") => {
    if (busy) return;
    const current = s.going ? "going" : s.maybe ? "maybe" : "none";
    const next = current === status ? "none" : status;
    const going = (s.rsvpCount || 0) - (s.going ? 1 : 0) + (next === "going" ? 1 : 0);
    const maybe = (s.maybeCount || 0) - (s.maybe ? 1 : 0) + (next === "maybe" ? 1 : 0);
    const prev: RsvpPatch = { going: s.going, maybe: !!s.maybe, rsvpCount: s.rsvpCount, maybeCount: s.maybeCount || 0 };
    onChange({ going: next === "going", maybe: next === "maybe", rsvpCount: going, maybeCount: maybe });
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${s.id}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) onChange(prev);
    } catch {
      onChange(prev);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!s.isHost && s.status !== "ended" && (
        <>
          <Button size="sm" variant={s.going ? "default" : "outline"} onClick={() => set("going")} className="min-h-9">
            {s.going && <Check className="h-4 w-4 mr-1" />} Going
          </Button>
          <Button size="sm" variant={s.maybe ? "amber" : "outline"} onClick={() => set("maybe")} className="min-h-9">
            {s.maybe ? <Check className="h-4 w-4 mr-1" /> : <HelpCircle className="h-4 w-4 mr-1" />} Maybe
          </Button>
        </>
      )}
      {s.status !== "ended" && (
        <a
          href={`/api/sessions/${s.id}/ics`}
          download
          className="inline-flex items-center gap-1 min-h-9 px-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600"
        >
          <CalendarDays className="h-4 w-4" /> Add to calendar
        </a>
      )}
    </div>
  );
}

interface Person {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isHost: boolean;
}

/** Expandable attendee list with counts: "5 going · 2 maybe". */
export function AttendeeList({ s }: { s: RsvpSession }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ going: Person[]; maybe: Person[] } | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    try {
      const res = await fetch(`/api/sessions/${s.id}/response`);
      const j = await res.json();
      if (j.ok) setData({ going: asArray<Person>(j.data.going), maybe: asArray<Person>(j.data.maybe) });
    } catch {
      // keep the previous list
    }
  };

  return (
    <div className="mt-1">
      <button onClick={toggle} className="inline-flex items-center gap-1 text-xs text-teal-700 dark:text-teal-400 font-medium min-h-8">
        {s.rsvpCount} going{s.maybeCount ? ` · ${s.maybeCount} maybe` : ""}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 space-y-1.5">
          {!data ? (
            <div className="h-8 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse" />
          ) : data.going.length + data.maybe.length === 0 ? (
            <p className="text-xs text-slate-500">Nobody yet — be the first.</p>
          ) : (
            [...data.going.map((p) => ({ p, label: "" })), ...data.maybe.map((p) => ({ p, label: "maybe" }))].map(({ p, label }) => (
              <div key={p.uid} className="flex items-center gap-2 text-sm">
                <Avatar name={p.displayName} photoURL={p.photoURL} seed={p.uid} size={24} />
                <span className="truncate">{p.displayName}</span>
                {p.isHost && <span className="text-[10px] px-1.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">host</span>}
                {label && <span className="text-[10px] px-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">{label}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
