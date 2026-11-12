"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Settings as SettingsIcon, Gauge, Sparkles, VolumeX, BookOpen, Eye, Brain, Bot, Baby, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePrefs, writePrefs } from "@/components/settings/use-prefs";
import { useAccessibility, writeAccessibility } from "@/components/settings/use-accessibility";
import { PREFS_KEY, parsePrefs } from "@/lib/settings/prefs";
import { parseAccessibility, type TtsSpeed } from "@/lib/settings/accessibility";
import { cn } from "@/lib/utils";
import { LanguageSettings } from "@/components/settings/language-picker";
import { BotToggle } from "@/components/bot/bot-toggle";
import { AppVersionCard } from "@/components/settings/app-version-card";

const OPTIONS: Array<{ key: "dataSaver" | "reduceMotion" | "noAutoplay" | "soundEffects"; title: string; desc: string; icon: React.ReactNode }> = [
  { key: "dataSaver", title: "Data saver", desc: "Audio and 3D wait for a tap, images load smaller, videos don't autoplay.", icon: <Gauge className="h-5 w-5" /> },
  { key: "reduceMotion", title: "Reduce motion", desc: "Calmer transitions instead of 3D flips and motion effects.", icon: <Sparkles className="h-5 w-5" /> },
  { key: "noAutoplay", title: "Don't autoplay audio or video", desc: "Nothing starts playing until you press play.", icon: <VolumeX className="h-5 w-5" /> },
  { key: "soundEffects", title: "Sprout sounds", desc: "Little chirps and page-flip sounds. Turn off if sound distracts you.", icon: <Volume2 className="h-5 w-5" /> },
];

const SPEEDS: TtsSpeed[] = [0.85, 1, 1.25];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700")}
    >
      <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export default function SettingsPage() {
  const [prefs, update] = usePrefs();
  const [a11y, updateA11y] = useAccessibility();

  // First visit on this device: adopt what the student saved on another device.
  useEffect(() => {
    let has = false;
    try {
      has = localStorage.getItem(PREFS_KEY) !== null;
    } catch {
      /* ignore */
    }
    if (has) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data.prefs) writePrefs(parsePrefs(j.data.prefs));
        if (j.ok && j.data.accessibility) writeAccessibility(parseAccessibility(j.data.accessibility));
      })
      .catch(() => null);
  }, []);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-7 w-7 text-brand-600" /> Settings
        </h1>
        <p className="text-sm text-slate-500">Your language, reading comfort, AI teaching style, and data saving. Kept on this device and in your account.</p>
      </div>
      <Card>
        <LanguageSettings />
      </Card>

      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {OPTIONS.map((o) => (
          <div key={o.key} className="flex items-center gap-3 p-4">
            <span className="text-brand-600">{o.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{o.title}</p>
              <p className="text-xs text-slate-500">{o.desc}</p>
            </div>
            <Toggle on={prefs[o.key]} onChange={(v) => update({ [o.key]: v })} label={o.title} />
          </div>
        ))}
        <BotToggle />
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">Reading &amp; Dyslexia Comfort</p>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center gap-3 p-4">
            <span className="text-teal-600"><BookOpen className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Dyslexia-friendly reading font</p>
              <p className="text-xs text-slate-500">Open letter shapes and distinct character spacing inside notes and lessons.</p>
            </div>
            <Toggle
              on={a11y.readingFont === "dyslexic"}
              onChange={(v) => updateA11y({ readingFont: v ? "dyslexic" : "default" })}
              label="Dyslexia-friendly reading font"
            />
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="text-teal-600"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Extra line &amp; letter spacing</p>
              <p className="text-xs text-slate-500">More breathing room between lines and words to stop text from crowding.</p>
            </div>
            <Toggle on={a11y.wideSpacing} onChange={(v) => updateA11y({ wideSpacing: v })} label="Extra line and letter spacing" />
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="text-amber-500"><Eye className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Warm soft paper tint</p>
              <p className="text-xs text-slate-500">Reduces harsh glare inside interactive notebooks and topic lessons.</p>
            </div>
            <Toggle on={a11y.warmPaper} onChange={(v) => updateA11y({ warmPaper: v })} label="Warm soft paper tint" />
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="text-teal-600"><Eye className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Reading ruler focus guide</p>
              <p className="text-xs text-slate-500">Soft highlight band that follows your cursor or tap to keep your place.</p>
            </div>
            <Toggle on={a11y.readingRuler} onChange={(v) => updateA11y({ readingRuler: v })} label="Reading ruler focus guide" />
          </div>
          <div className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-teal-600"><Volume2 className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Read-aloud voice speed</p>
              <p className="text-xs text-slate-500">Default playback speed when listening to notes and tutor replies.</p>
            </div>
            <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" role="group" aria-label="Read aloud speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => updateA11y({ ttsSpeed: s })}
                  aria-pressed={a11y.ttsSpeed === s}
                  className={cn(
                    "px-2.5 h-8 text-xs font-bold transition-colors",
                    a11y.ttsSpeed === s ? "bg-teal-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">AI Teaching Style</p>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center gap-3 p-4">
            <span className="text-amber-500"><Brain className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">ADHD Focus / Micro-Steps mode</p>
              <p className="text-xs text-slate-500">AI breaks explanations into tiny 2-minute steps with fast encouragement and zero long walls of text.</p>
            </div>
            <Toggle on={a11y.adhdFocus} onChange={(v) => updateA11y({ adhdFocus: v })} label="ADHD Focus Micro-Steps mode" />
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="text-teal-600"><Bot className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Clear literal explanations</p>
              <p className="text-xs text-slate-500">Direct, numbered facts without idioms, sarcasm, or vague figures of speech.</p>
            </div>
            <Toggle on={a11y.literalMode} onChange={(v) => updateA11y({ literalMode: v })} label="Clear literal explanations" />
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="text-emerald-500"><Baby className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Kids / Young Explorer mode</p>
              <p className="text-xs text-slate-500">Playful Teach-the-Bot AI, visual counting counters, and extra lively interactive celebrations.</p>
            </div>
            <Toggle on={a11y.kidsMode} onChange={(v) => updateA11y({ kidsMode: v })} label="Kids Explorer mode" />
          </div>
        </Card>
      </div>

      <AppVersionCard />

      <Link href="/offline" className="inline-block rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-900">
        Offline downloads
      </Link>
    </div>
  );
}
