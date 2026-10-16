"use client";

import React, { createContext, useContext, useState, useSyncExternalStore } from "react";
import { Hand, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * On a phone a canvas that grabs every touch traps the page: you can't scroll past it. So on touch
 * screens the circuit bench and the 3D view let a swipe scroll the page until the student taps
 * "Move & zoom"; then they own the gestures (drag parts, pan, pinch) until they tap "Done". Mouse users
 * and the full-screen stage are always interactive.
 */
export const ImmersiveContext = createContext(false);

const query = "(pointer: coarse)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function useGestureLock(alwaysOn = false) {
  const immersive = useContext(ImmersiveContext);
  const coarse = useCoarsePointer();
  const [active, setActive] = useState(false);
  const interactive = alwaysOn || immersive || !coarse || active;
  return { coarse, immersive, active, setActive, interactive, canToggle: coarse && !alwaysOn && !immersive };
}

export function GestureToggle({ active, onChange, className }: { active: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold shadow-lg min-h-[40px]",
        active ? "bg-teal-500 text-slate-950" : "bg-slate-900/85 text-white border border-white/30",
        className
      )}
    >
      {active ? <Check className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
      {active ? "Done" : "Move & zoom"}
    </button>
  );
}
