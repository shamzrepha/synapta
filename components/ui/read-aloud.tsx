"use client";

import React, { useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";

function toSpeech(md: string): string {
  return md
    .replace(/\$\$?([^$]+)\$\$?/g, "$1")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads text aloud with the device's built-in voice (free, instant, works offline). */
export function ReadAloud({ text, className }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => {
    if (speaking) window.speechSynthesis?.cancel();
  }, [speaking]);

  if (typeof window !== "undefined" && !("speechSynthesis" in window)) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(toSpeech(text));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={speaking ? "Stop reading" : "Read aloud"}
      title={speaking ? "Stop" : "Read aloud"}
      className={className || "inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-teal-600 mt-1"}
    >
      {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} {speaking ? "Stop" : "Listen"}
    </button>
  );
}
