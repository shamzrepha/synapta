"use client";

import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { createPortal } from "react-dom";

export interface Point {
  x: number;
  y: number;
}
export interface RopeHandle {
  /** the haul rope: draw it from `from` towards `to`; `grow` 0..1 is how much is out, `taut` 0..1 how tight (a loose rope sags) */
  set: (from: Point, to: Point, grow: number, taut: number) => void;
  /** the anchor rope hooked to the top of the screen that Sprout hangs from: always straight and tight */
  setAnchor: (from: Point, to: Point, grow: number) => void;
  hide: () => void;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Sprout's ropes: thin lines with a little hook on the end, drawn straight onto a full-screen layer and driven by hand each frame. */
export const Rope = forwardRef<RopeHandle>(function Rope(_props, ref) {
  const haul = useRef<SVGGElement>(null);
  const haulPath = useRef<SVGPathElement>(null);
  const haulHook = useRef<SVGGElement>(null);
  const anchor = useRef<SVGGElement>(null);
  const anchorPath = useRef<SVGPathElement>(null);
  const anchorHook = useRef<SVGGElement>(null);

  useImperativeHandle(ref, () => ({
    set(from, to, grow, taut) {
      const g = clamp01(grow);
      const ex = from.x + (to.x - from.x) * g;
      const ey = from.y + (to.y - from.y) * g;
      const sag = (1 - clamp01(taut)) * 22 * g;
      haulPath.current?.setAttribute("d", `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${((from.x + ex) / 2).toFixed(1)} ${(((from.y + ey) / 2) + sag).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
      haulHook.current?.setAttribute("transform", `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
      if (haul.current) haul.current.style.opacity = g > 0 ? "1" : "0";
    },
    setAnchor(from, to, grow) {
      const g = clamp01(grow);
      const ex = from.x + (to.x - from.x) * g;
      const ey = from.y + (to.y - from.y) * g;
      anchorPath.current?.setAttribute("d", `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`);
      // the hook points up: it grips whatever it is hooked to
      anchorHook.current?.setAttribute("transform", `translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(180)`);
      if (anchor.current) anchor.current.style.opacity = g > 0 ? "1" : "0";
    },
    hide() {
      if (haul.current) haul.current.style.opacity = "0";
      if (anchor.current) anchor.current.style.opacity = "0";
    },
  }));

  if (typeof document === "undefined") return null;
  return createPortal(
    <svg className="sunroot-rope" aria-hidden="true">
      <g ref={anchor} style={{ opacity: 0 }}>
        <path ref={anchorPath} d="M0 0" fill="none" stroke="#475569" strokeWidth="2.6" strokeLinecap="round" />
        <g ref={anchorHook}>
          <circle r="4.2" fill="#f59e0b" stroke="#334155" strokeWidth="1.6" />
          <path d="M-4 3 L0 8 L4 3" fill="none" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <g ref={haul} style={{ opacity: 0 }}>
        <path ref={haulPath} d="M0 0" fill="none" stroke="#475569" strokeWidth="2.6" strokeLinecap="round" />
        <g ref={haulHook}>
          <circle r="4.2" fill="#f59e0b" stroke="#334155" strokeWidth="1.6" />
          <path d="M-4 3 L0 8 L4 3" fill="none" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </svg>,
    document.body,
  );
});
