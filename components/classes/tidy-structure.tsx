"use client";

import React, { useState } from "react";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface Summary { topics: number; changed: number; reordered: number; prerequisitesRemoved: number; weeksFixed: number; parentsFixed: number; sourcesRelinked: number }

/** Lecturer button: tidy the topic order, prerequisites and weeks. No AI, no reading of notes, no lesson rewritten, so it uses no tokens. */
export function TidyStructure({ classId, onDone }: { classId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Summary | null>(null);

  const call = async (apply: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/restructure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apply }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return toast({ title: "Couldn't tidy the structure", description: j?.error?.message || "Try again.", variant: "destructive" });
      const s = j.data.summary as Summary;
      if (!apply) {
        if (s.changed === 0) return toast({ title: "Already tidy", description: "Nothing needed changing." });
        return setPreview(s);
      }
      toast({ title: "Structure tidied", description: `${s.changed} topic${s.changed === 1 ? "" : "s"} updated. No lessons were changed.`, variant: "success" });
      setPreview(null);
      onDone();
    } catch {
      toast({ title: "Network error", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="text-xs" onClick={() => void call(false)} isLoading={busy && !preview} title="Fix topic order, prerequisites and weeks without using AI">
        <ListTree className="mr-1 h-3.5 w-3.5 text-brand-600" /> Tidy structure
      </Button>
      {preview && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Tidy class structure" onClick={() => setPreview(null)}>
          <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Tidy the structure?</h2>
            <p className="text-sm text-muted-foreground">This changes how topics are ordered and linked. It does not read your notes, call the AI, or change any lesson, practice or student progress.</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{preview.changed} of {preview.topics} topics will be updated</li>
              {preview.reordered > 0 && <li>{preview.reordered} moved so prerequisites come first</li>}
              {preview.prerequisitesRemoved > 0 && <li>{preview.prerequisitesRemoved} broken or circular prerequisite link{preview.prerequisitesRemoved === 1 ? "" : "s"} removed</li>}
              {preview.weeksFixed > 0 && <li>{preview.weeksFixed} week{preview.weeksFixed === 1 ? "" : "s"} adjusted</li>}
              {preview.sourcesRelinked > 0 && <li>{preview.sourcesRelinked} topic{preview.sourcesRelinked === 1 ? "" : "s"} re-linked to the uploaded notes they come from (by name only)</li>}
              {preview.parentsFixed > 0 && <li>{preview.parentsFixed} parent link{preview.parentsFixed === 1 ? "" : "s"} fixed</li>}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
              <Button onClick={() => void call(true)} isLoading={busy}>Tidy now</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
