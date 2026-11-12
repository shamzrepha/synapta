"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReadAloud } from "@/components/ui/read-aloud";
import { usePrefs } from "@/components/settings/use-prefs";

interface FlipCardProps {
  flipped: boolean;
  onFlip: () => void;
  front: React.ReactNode;
  back: React.ReactNode;
  frontPlainText?: string;
  backPlainText?: string;
  frontBadge?: React.ReactNode;
  backBadge?: React.ReactNode;
  minHeightClass?: string;
  className?: string;
}

/**
 * Interactive 3D perspective card flip for active-recall flashcards and kid learning games.
 * Falls back cleanly to a crossfade swap when Reduced Motion is enabled.
 */
export function FlipCard({
  flipped,
  onFlip,
  front,
  back,
  frontPlainText,
  backPlainText,
  frontBadge = "Question",
  backBadge = "Answer",
  minHeightClass = "min-h-[260px]",
  className,
}: FlipCardProps) {
  const [prefs] = usePrefs();
  const osReduced = useReducedMotion();
  const reduceMotion = Boolean(prefs.reduceMotion || osReduced);

  const activeText = flipped ? backPlainText : frontPlainText;

  return (
    <div
      className={cn("perspective-1200 relative w-full select-none", className)}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? "Showing answer. Activate to flip back to question." : "Showing question. Activate to reveal answer."}
      onClick={onFlip}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onFlip();
        }
      }}
    >
      {activeText && (
        <div
          className="absolute top-3 right-3 z-20"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ReadAloud text={activeText} label="Read" showSpeed={false} />
        </div>
      )}

      {reduceMotion ? (
        <div
          className={cn(
            "sunroot-paper w-full rounded-2xl border-2 p-6 md:p-8 flex flex-col justify-between shadow-sm transition-colors cursor-pointer",
            minHeightClass,
            flipped
              ? "border-teal-500/70 bg-teal-50/40 dark:bg-teal-950/25"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900",
          )}
        >
          <div className="pr-20 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            {flipped ? backBadge : frontBadge}
          </div>
          <div className="my-4 text-center flex-1 flex flex-col items-center justify-center">
            {flipped ? back : front}
          </div>
          <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <RotateCw className="h-3.5 w-3.5" />
            {flipped ? "Tap to view question" : "Tap or press Space to flip"}
          </div>
        </div>
      ) : (
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.9 }}
          style={{ transformStyle: "preserve-3d" }}
          className={cn("relative w-full cursor-pointer", minHeightClass)}
        >
          {/* Front Face */}
          <div
            className={cn(
              "backface-hidden sunroot-paper absolute inset-0 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-8 flex flex-col justify-between shadow-md hover:border-teal-400/70 transition-colors",
            )}
          >
            <div className="pr-20 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {frontBadge}
            </div>
            <div className="my-3 text-center flex-1 flex flex-col items-center justify-center overflow-y-auto">
              {front}
            </div>
            <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <RotateCw className="h-3.5 w-3.5" /> Tap or press Space to flip
            </div>
          </div>

          {/* Back Face */}
          <div
            style={{ transform: "rotateY(180deg)" }}
            className={cn(
              "backface-hidden sunroot-paper absolute inset-0 rounded-2xl border-2 border-teal-500/65 bg-teal-50/45 dark:bg-teal-950/30 p-6 md:p-8 flex flex-col justify-between shadow-md",
            )}
          >
            <div className="pr-20 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              {backBadge}
            </div>
            <div className="my-3 text-center flex-1 flex flex-col items-center justify-center overflow-y-auto">
              {back}
            </div>
            <div className="text-center text-xs text-teal-700/70 dark:text-teal-300/70 flex items-center justify-center gap-1.5">
              <RotateCw className="h-3.5 w-3.5" /> Tap to flip back
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
