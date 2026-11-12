"use client";

import React from "react";
import { Sparkles, Search, Lightbulb, Target, Volume2, VolumeX, MessageSquare, X, RotateCw } from "lucide-react";
import type { PetInfo } from "@/components/bot/bot-provider";

export function JarvisHud({
  pet,
  open,
  onClose,
  onScan,
  onExplain,
  onQuiz,
  onReadAloud,
  onFlip,
  onAskTutor,
  isReading = false,
}: {
  pet: PetInfo;
  open: boolean;
  onClose: () => void;
  onScan: () => void;
  onExplain: () => void;
  onQuiz: () => void;
  onReadAloud: () => void;
  onFlip: () => void;
  onAskTutor: () => void;
  isReading?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={`${pet.name} Jarvis Desk Buddy`}
      className="sunroot-jarvis-hud fixed z-50 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 sm:right-6 w-[min(340px,calc(100vw-24px))] rounded-2xl border border-brand-500/30 bg-background/95 p-3.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {pet.name} • Desk Buddy
            </h4>
            <p className="text-[11px] text-muted-foreground">Jarvis study helper</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close desk buddy menu"
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => {
            onClose();
            onScan();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-xs font-medium hover:bg-sky-500/10 transition-colors group"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 group-hover:scale-105 transition-transform">
            <Search className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">Scan Key Terms</div>
            <div className="text-[10px] text-muted-foreground">Magnifies & scans concepts on page</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onExplain();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-xs font-medium hover:bg-amber-500/10 transition-colors group"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
            <Lightbulb className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">Explain Simply</div>
            <div className="text-[10px] text-muted-foreground">Plain-English breakdown in 3 bullets</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onQuiz();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-xs font-medium hover:bg-emerald-500/10 transition-colors group"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
            <Target className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">Quick Recall Quiz</div>
            <div className="text-[10px] text-muted-foreground">1-question check to lock memory</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onReadAloud();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-xs font-medium hover:bg-purple-500/10 transition-colors group"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
            {isReading ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">{isReading ? "Stop Reading" : "Read Section Aloud"}</div>
            <div className="text-[10px] text-muted-foreground">{isReading ? "Mute active voice reader" : "Voice read of key takeaways"}</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onFlip();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-xs font-medium hover:bg-pink-500/10 transition-colors group"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-500/15 text-pink-600 dark:text-pink-400 group-hover:scale-105 transition-transform">
            <RotateCw className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">Do a Backflip!</div>
            <div className="text-[10px] text-muted-foreground">Watch Sprout do an acrobatic trick</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onAskTutor();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-xs font-medium hover:bg-brand-500/15 transition-colors group border border-brand-500/20 bg-brand-500/5"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white group-hover:scale-105 transition-transform">
            <MessageSquare className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">Chat with AI Tutor</div>
            <div className="text-[10px] text-muted-foreground">Open full conversation with {pet.name}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
