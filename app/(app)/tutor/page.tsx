"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { TutorChat } from "@/components/tutor/tutor-chat";

export default function TutorPage() {
  // ?class=&topic= deep links (e.g. from a class page)
  const [ctx, setCtx] = useState<{ classId: string; kcId: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = setTimeout(() => setCtx({ classId: p.get("class") || "", kcId: p.get("topic") || "" }), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">AI Tutor</h1>
        <p className="text-sm text-slate-500">Ask about any subject, or focus on one of your classes or topics.</p>
      </div>
      <Card className="overflow-hidden h-[calc(100dvh-14rem)] md:h-[calc(100dvh-12rem)] min-h-[420px]">
        {ctx && <TutorChat key={`${ctx.classId}:${ctx.kcId}`} initialClassId={ctx.classId} initialKcId={ctx.kcId} />}
      </Card>
    </div>
  );
}
