"use client";

import React, { useEffect, useRef } from "react";

/**
 * A field of small squares that fade in and out, dissolving upward. Decorative: it is hidden from assistive tech, pauses when it is
 * off screen, and draws a single still frame under reduced motion.
 */
export function PixelField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = 12;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cols = 0;
    let rows = 0;
    let phase: number[] = [];
    let raf = 0;
    let visible = true;
    let last = 0;

    const dark = () => document.documentElement.classList.contains("dark");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / cell);
      rows = Math.ceil(height / cell);
      phase = Array.from({ length: cols * rows }, () => Math.random() * Math.PI * 2);
    };

    const draw = (t: number) => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const warm = dark() ? "111,141,255" : "53,82,224";
      const cool = dark() ? "236,241,238" : "18,25,24";
      for (let y = 0; y < rows; y++) {
        const fall = 1 - y / rows; // brightest at the top, gone at the bottom
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const wave = (Math.sin(phase[i] + t * 0.0009 + x * 0.12) + 1) / 2;
          // only some cells are lit, so it reads as scattered pixels, not a texture
          if (wave < 0.62 || Math.sin(phase[i] * 7.3) < 0.1) continue;
          const a = (wave - 0.62) * 1.9 * fall * fall;
          const warmCell = Math.sin(phase[i] * 3.1) > 0.55;
          ctx.fillStyle = `rgba(${warmCell ? warm : cool},${Math.min(0.55, a * (warmCell ? 0.75 : 0.22))})`;
          ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || now - last < 42) return; // about 24 frames a second is plenty
      last = now;
      draw(now);
    };

    resize();
    draw(0);
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
