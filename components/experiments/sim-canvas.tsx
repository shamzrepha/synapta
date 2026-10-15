"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A sharp, responsive canvas. `draw` gets (ctx, width, height, seconds). When `animated` the clock runs
 * (unless `paused`) and draw is called every frame; otherwise it is called once per change of `draw`.
 */
export function SimCanvas({ draw, animated = false, paused = false, className }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void; animated?: boolean; paused?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  const pausedRef = useRef(paused);
  const state = useRef({ w: 0, h: 0, t: 0, ctx: null as CanvasRenderingContext2D | null });

  useEffect(() => {
    drawRef.current = draw;
    pausedRef.current = paused;
  });

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const st = state.current;
    st.ctx = ctx;
    let raf = 0;
    let last = performance.now();
    const paint = () => drawRef.current(ctx, st.w, st.h, st.t);
    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      st.w = r.width;
      st.h = r.height;
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    };
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) st.t += dt;
      paint();
      raf = requestAnimationFrame(frame);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    if (animated) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [animated]);

  // static canvases repaint when what they show changes
  useEffect(() => {
    const st = state.current;
    if (!animated && st.ctx && st.w) draw(st.ctx, st.w, st.h, st.t);
  }, [draw, animated]);

  return <canvas ref={ref} className={cn("block w-full rounded-xl bg-[#0b1220]", className)} />;
}
