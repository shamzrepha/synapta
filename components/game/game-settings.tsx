"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { GameState } from "./use-game";

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer py-2">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function GameSettings({ game }: { game: GameState }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(game.settings);

  const update = async (patch: Partial<GameState["settings"]>) => {
    const prev = settings;
    setSettings({ ...settings, ...patch });
    const res = await fetch("/api/me/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res || !res.ok) {
      setSettings(prev);
      toast({ title: "Couldn't save setting", variant: "destructive" });
    }
  };

  return (
    <Card className="p-5 divide-y divide-slate-100 dark:divide-slate-800">
      <p className="font-bold pb-2">Privacy & sharing</p>
      <Toggle
        checked={settings.showOnLeaderboard}
        onChange={(v) => update({ showOnLeaderboard: v })}
        label="Show me on leaderboards"
        description="Turn off to learn without competing. You'll still see your own rank."
      />
      <Toggle
        checked={settings.autoShareAchievements}
        onChange={(v) => update({ autoShareAchievements: v })}
        label="Share achievements to the community feed"
        description="Level-ups, rare badges, mastered topics and wins are posted automatically."
      />
    </Card>
  );
}
