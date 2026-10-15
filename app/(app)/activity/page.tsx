"use client";

import { Card } from "@/components/ui/card";
import { ActivityHeatmap } from "@/components/activity/activity-heatmap";
import { useUserStore } from "@/lib/store/use-user-store";

export default function ActivityPage() {
  const uid = useUserStore((s) => s.user?.uid);
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Study heatmap</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Every square is a day. Darker means more learning activity.</p>
      </div>
      <Card className="p-4 sm:p-5">{uid ? <ActivityHeatmap uid={uid} /> : <div className="h-32 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />}</Card>
    </div>
  );
}
