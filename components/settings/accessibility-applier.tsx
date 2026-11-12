"use client";

import React, { useEffect, useState } from "react";
import { usePrefs } from "./use-prefs";
import { useAccessibility } from "./use-accessibility";

/**
 * Mirrors sensory & reading accessibility preferences onto <html data-*> attributes
 * and renders an optional translucent Reading Ruler bar that follows pointer/touch Y
 * to help dyslexic & ADHD learners track lines smoothly.
 */
export function AccessibilityApplier() {
  const [prefs] = usePrefs();
  const [a11y] = useAccessibility();
  const [rulerY, setRulerY] = useState<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceMotion = prefs.reduceMotion ? "true" : "false";
    root.dataset.readingFont = a11y.readingFont;
    root.dataset.wideSpacing = a11y.wideSpacing ? "true" : "false";
    root.dataset.warmPaper = a11y.warmPaper ? "true" : "false";
    root.dataset.kidsMode = a11y.kidsMode ? "true" : "false";
    root.dataset.adhdFocus = a11y.adhdFocus ? "true" : "false";
  }, [prefs.reduceMotion, a11y]);

  useEffect(() => {
    if (!a11y.readingRuler) return;
    const onMove = (e: PointerEvent) => {
      if (typeof e.clientY === "number") setRulerY(e.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [a11y.readingRuler]);

  if (!a11y.readingRuler || rulerY === null) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-[45] h-11 -translate-y-1/2 border-y border-teal-500/35 bg-teal-400/10 dark:bg-teal-300/10 transition-[top] duration-75"
      style={{ top: rulerY }}
    />
  );
}
