"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { FORMATS, FORMAT_LABEL, type MapNode, type MirrorPrefs, type MirrorProfile } from "@/lib/mirror/schema";

interface MirrorData {
  personalise: boolean;
  prefs: MirrorPrefs;
  profile: MirrorProfile;
  summary?: string;
  totalSignals?: number;
}

const SOURCE_WORD = { observed: "Seen in how you study", you_set: "You set this", not_enough_data: "Still learning" } as const;

function Confidence({ value, source }: { value: number; source: MapNode["source"] }) {
  const pct = Math.round(value * 100);
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      {/* lightness encodes confidence, a dashed outline marks "still learning", and the number is always shown */}
      <span className={cn("h-2 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800", source === "not_enough_data" && "outline-dashed outline-1 outline-slate-400")} aria-hidden>
        <span className="block h-full bg-brand-700 dark:bg-brand-300" style={{ width: `${pct}%`, opacity: 0.35 + 0.65 * value }} />
      </span>
      <span className="font-mono">{pct}%</span>
      <span>{SOURCE_WORD[source]}</span>
    </span>
  );
}

function Node({ node, depth = 0 }: { node: MapNode; depth?: number }) {
  return (
    <li className={cn(depth > 0 && "border-l border-border pl-4")}>
      <div className="py-1.5">
        <p className={cn("font-medium", depth === 0 ? "text-lg" : depth === 1 ? "text-base" : "text-sm")}>{node.label}</p>
        {node.detail && <p className="text-sm leading-relaxed text-muted-foreground">{node.detail}</p>}
        {depth > 0 && node.source !== undefined && (!node.children || node.children.length === 0) && <Confidence value={node.confidence} source={node.source} />}
      </div>
      {node.children && node.children.length > 0 && (
        <ul className="ml-1 space-y-1">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: Array<{ v: T | null; text: string }>; onChange: (v: T | null) => void }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm">{label}</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={cn("min-h-[40px] px-3 text-sm transition-colors", value === o.v ? "bg-brand-600 font-semibold text-white dark:bg-brand-500" : "hover:bg-slate-100 dark:hover:bg-slate-800")}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LearningMap() {
  const [data, setData] = useState<MirrorData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [interest, setInterest] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchJson<MirrorData>("/api/me/mirror");
    if (res.ok) setData(res.data);
    else setError(res.error.message || "Couldn't load your map.");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const patch = async (body: { personalise?: boolean; prefs?: Partial<MirrorPrefs> }) => {
    setBusy(true);
    setError("");
    const res = await fetchJson<MirrorData>("/api/me/mirror", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) await load();
    else setError(res.error.message || "Couldn't save that.");
  };

  const reset = async () => {
    setBusy(true);
    const res = await fetchJson<unknown>("/api/me/mirror/reset", { method: "POST" });
    setBusy(false);
    setConfirmReset(false);
    if (res.ok) await load();
    else setError(res.error.message || "Couldn't delete it.");
  };

  if (error && !data) return <Card><p role="alert" className="text-sm text-muted-foreground">{error}</p></Card>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" aria-busy="true" aria-label="Loading your map" />;

  const { prefs, profile } = data;
  const setFormat = (f: (typeof FORMATS)[number], v: "more" | "less" | null) => {
    const next = { ...prefs.formats };
    if (v) next[f] = v;
    else delete next[f];
    void patch({ prefs: { formats: next } });
  };
  const addInterest = () => {
    const v = interest.trim();
    if (!v || prefs.interests.length >= 8 || prefs.interests.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    setInterest("");
    void patch({ prefs: { interests: [...prefs.interests, v.slice(0, 40)] } });
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Personalise my learning</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {data.personalise ? "On. Sunroot is learning how you study to choose what to show you and how Sprout talks to you." : "Off. Nothing is collected about how you study, and the For you list is ordered only by what you need most."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.personalise}
            aria-label="Personalise my learning"
            disabled={busy}
            onClick={() => patch({ personalise: !data.personalise })}
            className={cn("relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors", data.personalise ? "bg-brand-600 dark:bg-brand-500" : "bg-slate-300 dark:bg-slate-700")}
          >
            <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform", data.personalise ? "translate-x-[22px]" : "translate-x-0.5")} />
          </button>
        </div>
        {data.personalise && data.summary && <p className="rounded-lg bg-brand-500/5 p-3 text-sm leading-relaxed ring-1 ring-brand-500/20">{data.summary}</p>}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-base font-semibold">What is collected</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Which kinds of activity you open, finish or skip, and when you tap &quot;too hard&quot; or &quot;too easy&quot;.</li>
          <li>How long you spend compared with the usual time, hints you use, retries, and how sure you say you feel.</li>
          <li>The hour of day and how long a session lasts, and topics you finish often.</li>
          <li>It is kept as running totals that fade over weeks, so it follows you as you change. Your answers and messages are not stored here.</li>
        </ul>
        <p className="text-sm leading-relaxed">It describes <strong>study habits</strong>, not who you are. It never diagnoses personality or ability, and what you most need to learn always ranks above what you enjoy. Teachers cannot see it.</p>
      </Card>

      {data.personalise && (
        <Card className="space-y-2">
          <h2 className="mb-1 text-base font-semibold">My learning map</h2>
          {profile.evidence < 5 && <p className="text-sm text-muted-foreground">Not much to show yet. Use the For you list a few times and this fills in.</p>}
          <ul><Node node={profile.tree} /></ul>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Tell Sunroot directly</h2>
        <p className="-mt-2 text-sm text-muted-foreground">What you set here beats anything Sunroot has noticed.</p>
        <div className="space-y-3">
          {FORMATS.map((f) => (
            <Seg key={f} label={FORMAT_LABEL[f]} value={prefs.formats[f] ?? null} options={[{ v: "less", text: "Less" }, { v: null, text: "Auto" }, { v: "more", text: "More" }]} onChange={(v) => setFormat(f, v)} />
          ))}
        </div>
        <hr className="border-border" />
        <Seg label="Pace" value={prefs.pace} options={[{ v: null, text: "Auto" }, { v: "quick", text: "Quick" }, { v: "steady", text: "Steady" }, { v: "deep", text: "Take my time" }]} onChange={(v) => patch({ prefs: { pace: v } })} />
        <Seg label="Examples" value={prefs.examples} options={[{ v: null, text: "Auto" }, { v: "short", text: "Short" }, { v: "long", text: "Worked out" }]} onChange={(v) => patch({ prefs: { examples: v } })} />
        <Seg label="Sprout's encouragement" value={prefs.encouragement} options={[{ v: null, text: "Auto" }, { v: "low", text: "Light" }, { v: "medium", text: "Some" }, { v: "high", text: "Lots" }]} onChange={(v) => patch({ prefs: { encouragement: v } })} />
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="goal" className="text-sm">Items in my daily goal</label>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Fewer items" disabled={busy || prefs.dailyGoalItems <= 1} onClick={() => patch({ prefs: { dailyGoalItems: prefs.dailyGoalItems - 1 } })}>-</Button>
            <span id="goal" className="w-8 text-center font-mono">{prefs.dailyGoalItems}</span>
            <Button variant="outline" size="icon" aria-label="More items" disabled={busy || prefs.dailyGoalItems >= 20} onClick={() => patch({ prefs: { dailyGoalItems: prefs.dailyGoalItems + 1 } })}>+</Button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="interest" className="text-sm">Things I like (Sprout can use them in examples)</label>
          <div className="flex flex-wrap gap-2">
            {prefs.interests.map((i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
                {i}
                <button type="button" aria-label={`Remove ${i}`} onClick={() => patch({ prefs: { interests: prefs.interests.filter((x) => x !== i) } })}><X className="h-3.5 w-3.5" aria-hidden /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input id="interest" value={interest} maxLength={40} placeholder="football, cooking, music..." onChange={(e) => setInterest(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInterest()} />
            <Button variant="outline" onClick={addInterest} disabled={busy}><Plus className="h-4 w-4" aria-hidden /> Add</Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Delete my profile</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">Removes everything above, including your edits and the summary, and turns personalisation off. Your classes, marks and mastery are not affected. This also happens automatically if you delete your account.</p>
        {confirmReset ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" onClick={reset} isLoading={busy}><Trash2 className="h-4 w-4" aria-hidden /> Yes, delete it</Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Keep it</Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirmReset(true)}><Trash2 className="h-4 w-4" aria-hidden /> Delete my profile</Button>
        )}
      </Card>
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
