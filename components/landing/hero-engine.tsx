import React from "react";
import { Check, FileText, Image as ImageIcon, Presentation } from "lucide-react";

const SOURCES = [
  { icon: FileText, name: "cell-division.pdf", kind: "PDF", delay: "0s" },
  { icon: ImageIcon, name: "IMG_2041.jpg", kind: "Scan, read with vision", delay: "0.5s" },
  { icon: Presentation, name: "week-3-slides.pptx", kind: "Slides", delay: "1s" },
];

const OUTPUTS = [
  { title: "Study notes", meta: "6 sections, with page references", delay: "1.6s" },
  { title: "Lesson: mitosis, step by step", meta: "Animated, 5 steps", delay: "2.8s" },
  { title: "Flashcards", meta: "Made from your notes", delay: "4s" },
  { title: "Adaptive quiz", meta: "Gets harder as you improve", delay: "5.2s" },
];

/** The hero's product window: a looping, CSS-only picture of Sunroot reading files and deciding what a topic needs. A labelled example, not real data. */
export function HeroEngine() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background" role="img" aria-label="Example: three files are read, then study notes, a lesson, flashcards and a quiz appear">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Biology 101 / Week 3</p>
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Example</span>
      </div>

      <div className="grid md:grid-cols-[0.9fr_1.1fr]">
        {/* sources */}
        <div className="space-y-2 border-b border-border p-4 md:border-b-0 md:border-r">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Your files</p>
          <ul className="space-y-2">
            {SOURCES.map((s) => (
              <li key={s.name} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
                <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{s.name}</span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{s.kind}</span>
                </span>
                <span className="pipe-dot h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" style={{ ["--pipe-delay" as string]: s.delay }} />
              </li>
            ))}
          </ul>
          <div className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Sunroot decided this topic needs notes, a lesson, flashcards and a quiz.
            <span className="mt-1 block line-through decoration-muted-foreground/60">Circuit lab: not needed here</span>
          </div>
        </div>

        {/* outputs */}
        <div className="space-y-2 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ready to learn from</p>
          <ul className="space-y-2">
            {OUTPUTS.map((o) => (
              <li key={o.title} className="pipe-step rounded-md border border-border bg-card px-3 py-2.5" style={{ ["--pipe-delay" as string]: o.delay }}>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span className="text-sm font-medium">{o.title}</span>
                </div>
                <p className="mt-0.5 pl-[22px] text-xs text-muted-foreground">{o.meta}</p>
                <div className="mt-2 h-px w-full overflow-hidden bg-border pl-[22px]">
                  <div className="pipe-bar h-px w-full bg-teal-500" style={{ ["--pipe-delay" as string]: o.delay }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
