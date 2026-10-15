"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { asArray } from "@/lib/api/client";
import { useLiveChannel } from "@/lib/live/client";
import { PRESENCE_HEARTBEAT_MS, presenceLabel, type Presence } from "@/lib/studio/presence";

/**
 * Who is in this design right now: a coloured dot per teammate with the part they have selected.
 * Sends a heartbeat every 20 s and whenever your selection / editing state changes; listens on the
 * design's presence channel for changes. Renders nothing while you are alone.
 */
export function PresenceBar({ designId, selected, editing, tab }: { designId: string; selected: string | null; editing: boolean; tab: string }) {
  const [people, setPeople] = useState<Presence[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const state = useRef({ selected, editing, tab });
  useEffect(() => {
    state.current = { selected, editing, tab };
  }, [selected, editing, tab]);

  const refresh = useCallback(() => {
    fetch(`/api/studio/designs/${designId}/presence`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setMe(j.data.me);
        setPeople(asArray<Presence>(j.data.people));
      })
      .catch(() => undefined);
  }, [designId]);

  const beat = useCallback(() => {
    fetch(`/api/studio/designs/${designId}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.current),
    })
      .then(() => refresh())
      .catch(() => undefined);
  }, [designId, refresh]);

  // heartbeat + leave
  useEffect(() => {
    const first = setTimeout(beat, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") beat();
      else refresh();
    }, PRESENCE_HEARTBEAT_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      fetch(`/api/studio/designs/${designId}/presence`, { method: "DELETE", keepalive: true }).catch(() => undefined);
    };
  }, [designId, beat, refresh]);

  // selection or editing changed: tell the others (debounced)
  useEffect(() => {
    const t = setTimeout(beat, 600);
    return () => clearTimeout(t);
  }, [selected, editing, tab, beat]);

  useLiveChannel(`design-presence:${designId}`, refresh, 300);

  const others = people.filter((p) => p.uid !== me);
  if (!others.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="People in this design">
      {others.map((p) => (
        <span key={p.uid} title={presenceLabel(p)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5" style={{ borderColor: p.color }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
          <span className="font-semibold max-w-24 truncate">{p.name}</span>
          <span className="text-slate-500 max-w-28 truncate">{p.selected ? `· ${p.selected}` : p.editing ? "· editing" : "· viewing"}</span>
        </span>
      ))}
    </div>
  );
}
