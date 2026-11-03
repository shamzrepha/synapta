"use client";

import React, { useState } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MODE_LABEL, NEED_KEYS, STUDY_MODES, describeProfile, type NeedKey, type StudyMode, type StudyProfile } from "@/lib/study/profile";
import { cn } from "@/lib/utils";

const NEED_LABEL: Record<NeedKey, string> = {
  animation: "Interactive lesson",
  practice: "Practice & quiz",
  flashcards: "Flashcards",
  simulation: "Simulation",
  build: "Build lab",
  prove: "Prove it",
  tutor: "AI tutor",
};

/**
 * Tells the teacher in plain words what Sunroot built for this topic and lets them change it. Students only see the tabs
 * that are switched on, so a maths topic never shows a circuit lab.
 */
export function StudyProfileCard({ classId, kcId, profile, onChange }: { classId: string; kcId: string; profile: StudyProfile; onChange: (p: StudyProfile) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${kcId}/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.ok) onChange(j.data.profile as StudyProfile);
      else toast({ title: "Couldn't save", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't save", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-3 md:p-4 space-y-2 border-teal-500/30 bg-teal-500/5">
      <div className="flex flex-wrap items-center gap-2">
        <Wand2 className="h-4 w-4 text-teal-600" />
        <p className="text-xs flex-1 min-w-0">{describeProfile(profile)}</p>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "Done" : "Change"}</Button>
      </div>
      {open && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold" htmlFor="study-mode">Kind of topic</label>
            <select
              id="study-mode"
              value={profile.mode}
              disabled={busy}
              onChange={(e) => save({ mode: e.target.value as StudyMode })}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-xs"
            >
              {STUDY_MODES.map((m) => (
                <option key={m} value={m}>{MODE_LABEL[m]}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({})}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Let AI decide again"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {NEED_KEYS.filter((k) => k !== "tutor").map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => save({ needs: { [k]: !profile.needs[k] } })}
                aria-pressed={profile.needs[k]}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold", profile.needs[k] ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300")}
              >
                {NEED_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
