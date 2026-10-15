import { Card } from "@/components/ui/card";
import type { ReportNumbers } from "@/lib/report/compute";

function fmt(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Renders the numbers itself (never AI text) plus the short narrative. Used by the app and the public page. */
export function ReportView({ name, numbers, summary, suggestion }: { name?: string; numbers: ReportNumbers; summary?: string | null; suggestion?: string | null }) {
  const tiles: Array<[string, string]> = [
    ["XP gained", String(numbers.xpGained)],
    ["Study days", `${numbers.studyDays}/7`],
    ["Quizzes taken", String(numbers.quizzesTaken)],
    ["Quiz accuracy", numbers.accuracy === null ? "n/a" : `${numbers.accuracy}%`],
    ["Mastery gained", `+${numbers.masteryGain} pts`],
    ["Topics practised", String(numbers.topicsPracticed)],
    ["Topics mastered", String(numbers.topicsMastered)],
    ["Labs passed", String(numbers.labsPassed)],
    ["Flashcards", String(numbers.flashcards)],
    ["Posts", String(numbers.posts)],
    ["Streak", `${numbers.streakDays} days`],
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">{fmt(numbers.from)} to {fmt(numbers.to)}</p>
        {name && <p className="text-xl font-extrabold">{name}&apos;s week</p>}
      </div>
      {summary && (
        <Card className="p-4 space-y-2">
          <p className="text-sm leading-relaxed">{summary}</p>
          {suggestion && <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">Next step: {suggestion}</p>}
        </Card>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 bg-white dark:bg-slate-900/60">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="text-lg font-extrabold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
