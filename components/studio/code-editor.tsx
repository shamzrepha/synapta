"use client";

import React, { useRef } from "react";

/** Lightweight code editor: line numbers, tab inserts spaces, highlights the error line. */
export function CodeEditor({ value, onChange, errorLine, readOnly }: { value: string; onChange: (v: string) => void; errorLine?: number | null; readOnly?: boolean }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;
  return (
    <div className="relative flex rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#0b1220] text-slate-100 overflow-hidden font-mono text-[13px] leading-[1.6]">
      <div ref={gutter} className="select-none text-right text-slate-500 py-3 px-2 overflow-hidden" aria-hidden style={{ minWidth: 40 }}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? "bg-rose-600/40 text-rose-200 rounded" : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={ta}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Program code"
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !readOnly) {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            const next = value.slice(0, s) + "  " + value.slice(el.selectionEnd);
            onChange(next);
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
          }
        }}
        className="flex-1 min-h-[320px] resize-y bg-transparent py-3 pr-3 outline-none whitespace-pre overflow-auto"
        style={{ tabSize: 2 }}
      />
    </div>
  );
}
