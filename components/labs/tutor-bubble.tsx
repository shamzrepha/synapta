"use client";

import React from "react";
import { GraduationCap, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { readableText } from "@/lib/text/readable";

export type TutorTone = "ask" | "hint" | "praise" | "warn";
export interface TutorMessage {
  id: number;
  text: string;
  tone: TutorTone;
}

/** Turns a message from the lab's bridge into a tutor line, or null when it is not one. */
export function parseTutorMessage(type: string | undefined, detail: Record<string, unknown> | null | undefined, id: number): TutorMessage | null {
  if (type !== "tutor_say" || !detail) return null;
  const text = readableText(String(detail.text || ""));
  if (!text) return null;
  const tone = (["ask", "hint", "praise", "warn"] as const).find((t) => t === detail.tone) || "hint";
  return { id, text, tone };
}

const TONE: Record<TutorTone, string> = {
  ask: "border-brand-500/60",
  hint: "border-amber-500/60",
  praise: "border-teal-500/70",
  warn: "border-rose-500/70",
};

/** The home-tutor speech bubble shown over the lab. */
export function TutorBubble({ message, stars, className }: { message: TutorMessage | null; stars?: number; className?: string }) {
  if (!message) return null;
  return (
    <div
      key={message.id}
      role="status"
      aria-live="polite"
      className={cn("flex items-start gap-2.5 rounded-xl border bg-card/95 text-foreground shadow-lg backdrop-blur px-3 py-2.5 text-sm max-w-xl animate-in fade-in slide-in-from-bottom-2", TONE[message.tone], className)}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <GraduationCap className="h-4 w-4" />
      </span>
      <p className="leading-snug">{message.text}</p>
      {!!stars && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-600" aria-label={`${stars} stars`}>
          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> {stars}
        </span>
      )}
    </div>
  );
}
