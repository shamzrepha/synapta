"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  ListOrdered,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReadAloud } from "@/components/ui/read-aloud";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { paginateNoteMarkdown, type NotePageKind } from "@/lib/study/note-pages";
import { KineticStage } from "./kinetic-formula";
import { usePrefs } from "@/components/settings/use-prefs";

interface FlipbookNotesProps {
  markdown: string;
  title?: string;
  localized?: boolean;
  frameless?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
  headerExtra?: React.ReactNode;
}

const KIND_BADGE: Record<NotePageKind, { label: string; tone: string }> = {
  overview: {
    label: "Overview",
    tone: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
  },
  section: {
    label: "Concept",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  example: {
    label: "Worked Motion",
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  check: {
    label: "Check Yourself",
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  },
  summary: {
    label: "Summary",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
};

const pageVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 52 : -52,
    rotateY: dir > 0 ? 11 : -11,
    opacity: 0,
    scale: 0.985,
  }),
  center: {
    x: 0,
    rotateY: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -52 : 52,
    rotateY: dir > 0 ? -12 : 12,
    opacity: 0,
    scale: 0.985,
  }),
};

/**
 * Interactive swipeable & 3D animated page-flip notebook renderer with embedded live procedural
 * kinetic math/concept animations on each page plus an optional "Scroll All" toggle.
 */
export function FlipbookNotes({
  markdown,
  title,
  localized,
  frameless = false,
  onClick,
  className,
  headerExtra,
}: FlipbookNotesProps) {
  const pages = useMemo(() => paginateNoteMarkdown(markdown, title), [markdown, title]);
  const [rawIdx, setRawIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [viewMode, setViewMode] = useState<"flip" | "scroll">("flip");
  const [showIndex, setShowIndex] = useState(false);

  const [prefs] = usePrefs();
  const osReduced = useReducedMotion();
  const reduceMotion = Boolean(prefs.reduceMotion || osReduced);

  const pageIdx = Math.min(rawIdx, Math.max(0, pages.length - 1));
  const page = pages[pageIdx];
  const canPrev = pageIdx > 0;
  const canNext = pageIdx < pages.length - 1;

  const goTo = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, nextIdx));
    if (clamped === pageIdx) return;
    setDirection(clamped > pageIdx ? 1 : -1);
    setRawIdx(clamped);
    setShowIndex(false);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -55 || info.velocity.x < -380) {
      if (canNext) goTo(pageIdx + 1);
    } else if (info.offset.x > 55 || info.velocity.x > 380) {
      if (canPrev) goTo(pageIdx - 1);
    }
  };

  const allSpeech = useMemo(
    () => pages.map((p) => `${p.title}. ${p.plainText}`).join(" "),
    [pages],
  );

  const badge = KIND_BADGE[page.kind];

  return (
    <div
      className={cn("space-y-3", className)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (viewMode !== "flip") return;
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key === "ArrowRight" && canNext) {
          e.preventDefault();
          goTo(pageIdx + 1);
        } else if (e.key === "ArrowLeft" && canPrev) {
          e.preventDefault();
          goTo(pageIdx - 1);
        }
      }}
    >
      {/* Top Notebook Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowIndex((v) => !v)}
            className={cn(
              "h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors",
              showIndex
                ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
            )}
            aria-expanded={showIndex}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Page {pageIdx + 1} / {pages.length}
          </button>

          {page.scenes.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded-full">
              <Sparkles className="h-3 w-3" /> Interactive motion on page
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          <ReadAloud
            text={viewMode === "flip" ? `${page.title}. ${page.plainText}` : allSpeech}
            label={viewMode === "flip" ? "Read page" : "Read all"}
            showSpeed
          />
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/70 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => setViewMode("flip")}
              className={cn(
                "h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors",
                viewMode === "flip"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
              )}
            >
              <BookOpen className="h-3.5 w-3.5" /> Flipbook
            </button>
            <button
              type="button"
              onClick={() => setViewMode("scroll")}
              className={cn(
                "h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors",
                viewMode === "scroll"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
              )}
            >
              <FileText className="h-3.5 w-3.5" /> Scroll All
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Chapter Index Drawer */}
      {showIndex && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 grid gap-1.5 sm:grid-cols-2">
          {pages.map((p) => (
            <button
              key={p.index}
              type="button"
              onClick={() => goTo(p.index)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                p.index === pageIdx
                  ? "border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-200 font-bold"
                  : "border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800",
              )}
            >
              <span className="truncate">
                <span className="font-mono text-slate-400 mr-1.5">{p.index + 1}.</span>
                {p.title}
              </span>
              {p.scenes.length > 0 && (
                <Sparkles className="h-3 w-3 shrink-0 text-teal-600 dark:text-teal-400" />
              )}
            </button>
          ))}
        </div>
      )}

      {viewMode === "scroll" ? (
        <div
          className={cn(
            "sunroot-paper space-y-6",
            frameless ? "pt-1" : "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-7",
          )}
          onClick={onClick}
        >
          {pages.map((p) => (
            <div key={p.index} className="space-y-3 border-b last:border-b-0 border-slate-200/70 dark:border-slate-800 pb-6 last:pb-0">
              <MarkdownRenderer localized={localized} content={p.markdown} />
              <KineticStage scenes={p.scenes} pageKey={`scroll-${p.index}-${p.title}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="perspective-1200 relative">
          {/* Notebook Spine Accent */}
          <div
            aria-hidden="true"
            className="hidden sm:block pointer-events-none absolute left-2 top-3 bottom-3 w-1.5 rounded-full bg-gradient-to-b from-teal-500/35 via-amber-500/20 to-teal-500/35 z-10"
          />

          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={`${page.index}-${page.title}`}
              custom={direction}
              variants={reduceMotion ? undefined : pageVariants}
              initial={reduceMotion ? false : "enter"}
              animate="center"
              exit={reduceMotion ? undefined : "exit"}
              transition={
                reduceMotion
                  ? { duration: 0.08 }
                  : { type: "spring", stiffness: 270, damping: 28, mass: 0.9 }
              }
              drag={reduceMotion || pages.length <= 1 ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.14}
              onDragEnd={handleDragEnd}
              style={{ transformStyle: "preserve-3d" }}
              className="touch-pan-y cursor-grab active:cursor-grabbing"
            >
              <div
                className={cn(
                  "sunroot-paper relative overflow-hidden min-h-[320px] flex flex-col justify-between rounded-2xl",
                  frameless
                    ? "pl-4 sm:pl-6 py-2"
                    : "border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md p-5 sm:pl-7 md:p-7",
                )}
                onClick={onClick}
              >
                <div>
                  {/* Page Metadata Pill Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200/70 dark:border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                          badge.tone,
                        )}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> ~{page.readSeconds}s read
                      </span>
                    </div>
                    {pages.length > 1 && (
                      <span className="text-[11px] text-slate-400 hidden sm:inline">
                        Swipe left/right or use ← → keys
                      </span>
                    )}
                  </div>

                  {/* Page Markdown Content */}
                  <MarkdownRenderer localized={localized} content={page.markdown} />

                  {/* Live Procedural Animation Stage for This Page */}
                  <KineticStage scenes={page.scenes} pageKey={`flip-${page.index}-${page.title}`} />
                </div>

                {/* Bottom Flip Controls & Page Dots */}
                <div className="mt-6 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => goTo(pageIdx - 1)}
                    disabled={!canPrev}
                    className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 flex items-center gap-1.5 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>

                  {pages.length <= 14 ? (
                    <div className="flex items-center gap-1.5" aria-label="Page indicators">
                      {pages.map((p) => (
                        <button
                          key={p.index}
                          type="button"
                          onClick={() => goTo(p.index)}
                          aria-label={`Go to page ${p.index + 1}: ${p.title}`}
                          className={cn(
                            "h-2.5 rounded-full transition-all",
                            p.index === pageIdx
                              ? "w-7 bg-teal-600 dark:bg-teal-400"
                              : "w-2.5 bg-slate-300 dark:bg-slate-700 hover:bg-teal-500/50",
                          )}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs font-mono font-bold text-slate-500">
                      {pageIdx + 1} / {pages.length}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => goTo(pageIdx + 1)}
                    disabled={!canNext}
                    className="h-10 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-35 flex items-center gap-1.5 transition-colors"
                  >
                    Next Page <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
