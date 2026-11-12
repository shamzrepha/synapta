"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Target } from "lucide-react";
import { MindMapView } from "@/components/mindmap/mindmap-view";
import { kcsToMapTree, masteryColours, type MapKc } from "@/lib/classes/mind-tree";

/**
 * The class as an interactive mind map, drawn from its topic tree: fold branches, pan and pinch, and tap a topic to read it or
 * practise it. Colour shows how well you know each topic (pale to deep blue; dashed means not started).
 */
export function ClassMindMap({
  classId,
  title,
  kcs,
  masteryMap,
  attemptsMap,
  hereId,
  onRead,
  height,
}: {
  classId: string;
  title: string;
  kcs: MapKc[];
  masteryMap?: Record<string, number>;
  attemptsMap?: Record<string, number>;
  /** the topic the learner stopped at, ringed on the map */
  hereId?: string | null;
  /** read a chapter in place (the reader passes this); otherwise it opens the reader page */
  onRead?: (kcId: string) => void;
  height?: string;
}) {
  const tree = useMemo(() => kcsToMapTree(title, kcs), [title, kcs]);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <MindMapView
        tree={tree}
        title={title}
        selectedId={selected}
        onSelect={setSelected}
        hereId={hereId}
        height={height}
        nodeStyle={(id, depth) => {
          if (id === "root") return { fill: "#334155", text: "#ffffff" };
          const started = (attemptsMap?.[id] ?? 0) > 0 || (masteryMap?.[id] ?? 0) > 0.25;
          return masteryColours(masteryMap?.[id], started);
        }}
        renderActions={(n) =>
          n.id === "root" ? null : (
            <div className="flex shrink-0 gap-2">
              {onRead ? (
                <button type="button" onClick={() => onRead(n.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white">
                  <BookOpen className="h-3.5 w-3.5" /> Read
                </button>
              ) : (
                <Link href={`/classes/${classId}/read?kc=${n.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white">
                  <BookOpen className="h-3.5 w-3.5" /> Read
                </Link>
              )}
              <Link href={`/classes/${classId}/topics/${n.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                <Target className="h-3.5 w-3.5" /> Practice
              </Link>
            </div>
          )
        }
      />
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground" aria-label="Map key">
        {[
          ["Not started", "#e2e8f0", true],
          ["Learning", "#a9c1ff", false],
          ["Getting there", "#3b6df6", false],
          ["Mastered", "#1e3a8a", false],
        ].map(([label, fill, dash]) => (
          <li key={String(label)} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-full" style={{ background: String(fill), border: dash ? "1.5px dashed #64748b" : "none" }} /> {String(label)}
          </li>
        ))}
        {hereId && (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-6 rounded-full" style={{ border: "2px dashed #2563eb" }} /> You are here
          </li>
        )}
      </ul>
    </div>
  );
}
