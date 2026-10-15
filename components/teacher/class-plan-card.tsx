"use client";

import React, { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ClassroomPlanView, type ClassroomPlan } from "./classroom-plan";
import { cn } from "@/lib/utils";

/** Teacher-only: AI recommendations for making this class interactive, based on its uploaded documents. */
export function ClassPlanCard({
  classId,
  initialPlan,
  classInfo,
}: {
  classId: string;
  initialPlan: ClassroomPlan | null;
  classInfo: { title: string; subject: string; description: string; level?: string; durationWeeks?: number };
}) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<ClassroomPlan | null>(initialPlan);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/classes/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          title: classInfo.title,
          subject: classInfo.subject,
          description: classInfo.description || "",
          level: classInfo.level || "undergrad",
          durationWeeks: classInfo.durationWeeks || 4,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPlan(data.data);
        setOpen(true);
      } else {
        toast({ title: "Couldn't get recommendations", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 space-y-3 border-indigo-500/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => plan && setOpen((v) => !v)} className="flex items-center gap-2 text-left">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span>
            <span className="block font-bold text-sm">AI classroom plan</span>
            <span className="block text-xs text-slate-500">
              {plan ? `${plan.interactiveIdeas.length} interactive ideas · ${plan.outline.length}-topic outline` : "Recommendations based on your uploaded documents and topics"}
            </span>
          </span>
          {plan && <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />}
        </button>
        <Button size="sm" variant="outline" onClick={refresh} isLoading={loading}>
          {plan ? "Refresh" : "Get recommendations"}
        </Button>
      </div>
      {plan && open && <ClassroomPlanView plan={plan} />}
    </Card>
  );
}
