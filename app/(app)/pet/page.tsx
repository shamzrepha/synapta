"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Share2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Sprout, type BotPose } from "@/components/bot/sprout";
import { PET_EVENT, useBot } from "@/components/bot/bot-provider";
import { MOOD_COPY, PALETTES, type PetMood } from "@/lib/pet/mood";
import { SHOP_ITEMS, PET_SLOTS, type ShopItem } from "@/lib/shop/catalog";
import { cn } from "@/lib/utils";

interface PetData {
  name: string;
  gear: Record<string, string>;
  mood: PetMood;
  stats: { streakDays: number; daysAway: number; avgMastery: number | null; xp: number };
  ownedPet: string[];
}

const SLOT_LABEL: Record<string, string> = { hat: "Hats", face: "Faces", back: "Back and neck", shoes: "Shoes" };
const POSES: Array<{ pose: BotPose; label: string }> = [
  { pose: "dance", label: "Dance" },
  { pose: "jump", label: "Jump" },
  { pose: "wave", label: "Wave" },
  { pose: "search", label: "Look" },
];

export default function PetPage() {
  const { toast } = useToast();
  const bot = useBot();
  const [data, setData] = useState<PetData | null>(null);
  const [name, setName] = useState("");
  const [pose, setPose] = useState<BotPose>("idle");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/pet")).json();
      if (j.ok) {
        setData(j.data);
        setName((n) => n || j.data.name);
      }
    } catch {
      /* shown as loading */
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = (p: BotPose) => {
    setPose(p);
    window.setTimeout(() => setPose("idle"), p === "dance" ? 2800 : 1600);
  };

  const saveName = async () => {
    setSaving(true);
    try {
      const j = await (await fetch("/api/pet", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })).json();
      if (!j.ok) throw new Error(j.error?.message || "Couldn't save the name");
      setName(j.data.name);
      toast({ title: `Meet ${j.data.name}!`, variant: "success" });
      window.dispatchEvent(new Event(PET_EVENT));
      await load();
      act("wave");
    } catch (e) {
      toast({ title: "Couldn't save the name", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const wear = async (item: ShopItem, on: boolean) => {
    if (!item.petSlot) return;
    try {
      const j = await (await fetch("/api/shop/equip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot: `pet_${item.petSlot}`, itemId: on ? item.id : null }) })).json();
      if (!j.ok) throw new Error(j.error?.message || "Couldn't change that");
      window.dispatchEvent(new Event(PET_EVENT));
      await load();
      if (on) act("jump");
    } catch (e) {
      toast({ title: "Couldn't change that", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const showOff = async () => {
    if (!data) return;
    const text = `Meet ${data.name}, my SunRoot study buddy! ${data.stats.streakDays}-day streak, ${MOOD_COPY[data.mood].label.toLowerCase()} mood.`;
    try {
      if (navigator.share) await navigator.share({ title: data.name, text, url: window.location.origin });
      else {
        await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
        toast({ title: "Copied", description: "Paste it anywhere to show off.", variant: "success" });
      }
    } catch {
      /* cancelled */
    }
    act("dance");
  };

  const owned = SHOP_ITEMS.filter((i) => i.kind === "pet" && data?.ownedPet.includes(i.id));
  const mood = data?.mood ?? "calm";

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{data?.name || "Sprout"}</h1>
        <p className="text-sm text-slate-500">Your study buddy. Its colour shows how you are doing, and you dress it with XP.</p>
      </div>

      <Card className="p-5 grid gap-5 sm:grid-cols-[14rem_1fr] items-center">
        <div className="mx-auto h-56 w-48 rounded-3xl bg-gradient-to-b from-brand-500/10 to-transparent grid place-items-center">
          <div className="h-48 w-44">
            <Sprout pose={pose} mood={mood} palette={PALETTES[mood]} gear={data?.gear} />
          </div>
        </div>
        <div className="space-y-3 min-w-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mood</p>
            <p className="text-lg font-bold flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: PALETTES[mood].body }} /> {MOOD_COPY[mood].label}
            </p>
            <p className="text-sm text-slate-500">{MOOD_COPY[mood].how}</p>
          </div>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} aria-label="Name your bot" placeholder="Give it a name" />
            <Button onClick={saveName} isLoading={saving} disabled={!name.trim()}>Save</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {POSES.map((p) => (
              <Button key={p.pose} size="sm" variant="outline" onClick={() => act(p.pose)}>{p.label}</Button>
            ))}
            <Button size="sm" variant="outline" onClick={showOff}><Share2 className="h-4 w-4 mr-1.5" /> Show off</Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">How the colour changes</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {(Object.keys(MOOD_COPY) as PetMood[]).map((m) => (
            <div key={m} className={cn("rounded-xl border p-2 space-y-1", m === mood ? "border-brand-500 bg-brand-500/5" : "border-border")}>
              <span className="block h-4 w-4 rounded-full" style={{ background: PALETTES[m].body }} />
              <p className="font-semibold">{MOOD_COPY[m].label}</p>
            </div>
          ))}
        </div>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Wardrobe</h2>
          <Link href="/shop" className="text-xs font-semibold text-brand-600 dark:text-brand-400 underline inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Buy more in the shop</Link>
        </div>
        {owned.length === 0 && <Card className="p-4 text-sm text-slate-500">Nothing yet. Earn XP by studying, then buy hats, glasses, shoes and capes in the shop.</Card>}
        {PET_SLOTS.map((slot) => {
          const items = owned.filter((i) => i.petSlot === slot);
          if (items.length === 0) return null;
          return (
            <Card key={slot} className="p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500">{SLOT_LABEL[slot]}</p>
              <div className="flex flex-wrap gap-2">
                {items.map((i) => {
                  const on = data?.gear[slot] === i.id;
                  return (
                    <button key={i.id} type="button" onClick={() => wear(i, !on)} aria-pressed={on} className={cn("rounded-xl border px-3 py-2 text-sm font-semibold flex items-center gap-2", on ? "border-brand-500 bg-brand-500/10" : "border-border hover:bg-muted")}>
                      <span className="text-lg">{i.emoji}</span> {i.name}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </section>
      {bot.enabled ? null : <p className="text-xs text-slate-500">The helper bot is switched off in Settings; it will still show here.</p>}
    </div>
  );
}
