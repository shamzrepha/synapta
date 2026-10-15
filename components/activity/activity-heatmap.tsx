"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGrid, monthLabels, summarize, type DayCounts } from "@/lib/activity/heatmap";
import { cn } from "@/lib/utils";

// Light and dark ramps (level 0..4)
const RAMP = [
  "bg-slate-200/70 dark:bg-slate-800",
  "bg-teal-200 dark:bg-teal-900",
  "bg-teal-400 dark:bg-teal-700",
  "bg-teal-500 dark:bg-teal-500",
  "bg-teal-700 dark:bg-teal-300",
];

interface ApiData {
  today: string;
  counts: DayCounts;
}

function formatDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** GitHub-style 52-week activity grid for the signed-in student (`uid` must be their own). */
export function ActivityHeatmap({ uid, compact = false }: { uid: string; compact?: boolean }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ date: string; count: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/activity?uid=${encodeURIComponent(uid)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok) setData({ today: json.data.today, counts: json.data.counts || {} });
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const view = useMemo(() => {
    if (!data) return null;
    const grid = buildGrid(data.today, data.counts);
    return { grid, labels: monthLabels(grid), summary: summarize(data.counts, data.today) };
  }, [data]);

  if (failed) return <p className="text-xs text-slate-500">Couldn&apos;t load your activity right now.</p>;
  if (!view) return <div className="h-32 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />;

  const { grid, labels, summary } = view;
  const stats = [
    { label: "Activities", value: summary.total },
    { label: "Active days", value: summary.activeDays },
    { label: "Current streak", value: `${summary.currentStreak}d` },
    { label: "Longest streak", value: `${summary.longestStreak}d` },
  ];

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
              <p className="text-[11px] text-slate-500">{s.label}</p>
              <p className="text-lg font-extrabold">{s.value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-max">
          <div className="relative h-4 mb-1 text-[10px] text-slate-500">
            {labels.map((l) => (
              <span key={l.index} className="absolute" style={{ left: l.index * 14 }}>
                {l.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]" role="img" aria-label={`Activity over the last 52 weeks: ${summary.total} activities on ${summary.activeDays} days`}>
            {grid.map((col, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {col.map((c) =>
                  c.inRange ? (
                    <button
                      key={c.date}
                      type="button"
                      title={`${c.count} ${c.count === 1 ? "activity" : "activities"} on ${formatDate(c.date)}`}
                      aria-label={`${c.count} activities on ${formatDate(c.date)}`}
                      onMouseEnter={() => setHover({ date: c.date, count: c.count })}
                      onFocus={() => setHover({ date: c.date, count: c.count })}
                      onClick={() => setHover({ date: c.date, count: c.count })}
                      className={cn("h-[11px] w-[11px] rounded-[2px]", RAMP[c.level])}
                    />
                  ) : (
                    <span key={c.date} className="h-[11px] w-[11px]" />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="min-h-4">
          {hover ? `${hover.count} ${hover.count === 1 ? "activity" : "activities"} on ${formatDate(hover.date)}` : compact ? `${summary.total} activities in the last year` : "Tap a square for details"}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          Less
          {RAMP.map((r, i) => (
            <span key={i} className={cn("h-[11px] w-[11px] rounded-[2px]", r)} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
