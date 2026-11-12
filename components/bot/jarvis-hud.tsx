"use client";

import React from "react";
import { Sparkles, Search, Lightbulb, Target, Volume2, MessageSquare, X, RotateCw, Timer, Trophy } from "lucide-react";
import type { PetInfo } from "@/components/bot/bot-provider";
import type { HudPlacement } from "@/lib/pet/placement";

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
  placement,
  focusLabel,
  onFocus,
  onShowOff,
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
  /** where to open, worked out from where Sprout stands, so it never sits on Sprout or a bar */
  placement: HudPlacement | null;
  /** time left in a running focus sprint, or null when none is running */
  focusLabel: string | null;
  onFocus: () => void;
  onShowOff: () => void;
}) {
  if (!open || !placement) return null;

  return (
    <div
      role="dialog"
      aria-label={`${pet.name} Jarvis Desk Buddy`}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ pointerEvents: "auto", right: placement.right, bottom: placement.bottom, width: placement.width, maxHeight: placement.maxHeight }}
      className="sunroot-jarvis-hud pointer-events-auto fixed z-[80] overflow-y-auto overscroll-contain rounded-2xl border border-brand-500/30 bg-background/95 p-3.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
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
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close desk buddy menu"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onScan();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-sky-500/10 active:bg-sky-500/20 cursor-pointer transition-colors group touch-manipulation"
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
          onClick={(e) => {
            e.stopPropagation();
            onExplain();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-amber-500/10 active:bg-amber-500/20 cursor-pointer transition-colors group touch-manipulation"
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
          onClick={(e) => {
            e.stopPropagation();
            onQuiz();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-emerald-500/10 active:bg-emerald-500/20 cursor-pointer transition-colors group touch-manipulation"
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
          onClick={(e) => {
            e.stopPropagation();
            onReadAloud();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-purple-500/10 active:bg-purple-500/20 cursor-pointer transition-colors group touch-manipulation"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
            <Volume2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">Listen to this chapter</div>
            <div className="text-[10px] text-muted-foreground">Read aloud with the real voice</div>
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-orange-500/10 active:bg-orange-500/20 cursor-pointer transition-colors group touch-manipulation"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform">
            <Timer className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">{focusLabel ? `Stop sprint (${focusLabel})` : "Focus sprint"}</div>
            <div className="text-[10px] text-muted-foreground">{focusLabel ? "End the timer early" : "10 minutes of focus, then a short break"}</div>
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShowOff();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-yellow-500/10 active:bg-yellow-500/20 cursor-pointer transition-colors group touch-manipulation"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 group-hover:scale-105 transition-transform">
            <Trophy className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">Show off</div>
            <div className="text-[10px] text-muted-foreground">Meet Sprout, its outfit and its streak</div>
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFlip();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-pink-500/10 active:bg-pink-500/20 cursor-pointer transition-colors group touch-manipulation"
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
          onClick={(e) => {
            e.stopPropagation();
            onAskTutor();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-medium hover:bg-brand-500/15 active:bg-brand-500/25 cursor-pointer transition-colors group border border-brand-500/20 bg-brand-500/5 touch-manipulation"
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
