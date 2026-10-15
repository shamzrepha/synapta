"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { VoiceTutor } from "@/components/tutor/voice-tutor";

export default function VoiceTutorPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div>
        <Link href="/tutor" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-300 h-8">
          <ArrowLeft className="h-3.5 w-3.5" /> Text tutor
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight">Voice tutor</h1>
        <p className="text-sm text-slate-500">Ask out loud and hear the answer.</p>
      </div>
      <Card className="overflow-hidden p-0 h-[calc(100dvh-14rem)] md:h-[calc(100dvh-12rem)] min-h-[460px]">
        <VoiceTutor />
      </Card>
    </div>
  );
}
