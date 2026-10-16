"use client";

import React, { useEffect, useRef, useState } from "react";
import { Volume2, Square, Loader2 } from "lucide-react";
import { createSpeaker, type Speaker } from "@/lib/audio/speak";

/** Reads text aloud with the app's neural voice (a real audio file from the server, never the browser's robot voice). */
export function ReadAloud({ text, className }: { text: string; className?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "speaking">("idle");
  const speaker = useRef<Speaker | null>(null);
  useEffect(() => () => speaker.current?.stop(), []);

  const toggle = () => {
    if (state !== "idle") {
      speaker.current?.stop();
      setState("idle");
      return;
    }
    speaker.current ||= createSpeaker();
    setState("loading");
    speaker.current.say(
      text,
      () => setState("idle"),
      () => setState("idle")
    );
    // the first piece of audio starts within a moment; show "speaking" once the request is under way
    setTimeout(() => setState((s) => (s === "loading" ? "speaking" : s)), 600);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={state === "idle" ? "Read aloud" : "Stop reading"}
      title={state === "idle" ? "Read aloud" : "Stop"}
      className={className || "inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-teal-600 mt-1"}
    >
      {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "speaking" ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} {state === "idle" ? "Listen" : "Stop"}
    </button>
  );
}
