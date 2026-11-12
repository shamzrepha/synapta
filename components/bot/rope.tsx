"use client";

import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { createPortal } from "react-dom";

export interface Point {
  x: number;
  y: number;
}
export interface RopeHandle {
  /** draw the rope from `from` towards `to`; `grow` 0..1 is how much of it is out, `taut` 0..1 how tight (a loose rope sags) */
  set: (from: Point, to: Point, grow: number, taut: number) => void;
  hide: () => void;
}

/** Sprout's rope: a thin line with a little hook on the end, drawn straight onto a full-screen layer. Driven by hand each frame. */
export const Rope = forwardRef<RopeHandle>(function Rope(_props, ref) {
  const path = useRef<SVGPathElement>(null);
  const hook = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  useImperativeHandle(ref, () => ({
    set(from, to, grow, taut) {
      const g = Math.max(0, Math.min(1, grow));
      const ex = from.x + (to.x - from.x) * g;
      const ey = from.y + (to.y - from.y) * g;
      const sag = (1 - Math.max(0, Math.min(1, taut))) * 22 * g;
      path.current?.setAttribute("d", `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${((from.x + ex) / 2).toFixed(1)} ${(((from.y + ey) / 2) + sag).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
      hook.current?.setAttribute("transform", `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
      if (svg.current) svg.current.style.opacity = g > 0 ? "1" : "0";
    },
    hide() {
      if (svg.current) svg.current.style.opacity = "0";
    },
  }));

  if (typeof document === "undefined") return null;
  return createPortal(
    <svg ref={svg} className="sunroot-rope" aria-hidden="true" style={{ opacity: 0 }}>
      <path ref={path} d="M0 0" fill="none" stroke="#475569" strokeWidth="2.6" strokeLinecap="round" />
      <path d="" />
      <g ref={hook}>
        <circle r="4.2" fill="#f59e0b" stroke="#334155" strokeWidth="1.6" />
        <path d="M-4 3 L0 8 L4 3" fill="none" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>,
    document.body,
  );
});
