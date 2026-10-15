import { simulateLift } from "./gears";
import type { Mechanism } from "../spec";

/**
 * Plays the simulated lift in real time (capped at 12 s) by calling `onFrame` with the input shaft
 * angle and load height. Returns a function that stops it. Browser only.
 */
export function playLift(m: Mechanism, onFrame: (s: { inputAngle: number; loadHeight: number }) => void, onDone?: () => void): () => void {
  const r = simulateLift(m);
  const samples = r.samples;
  const end = samples[samples.length - 1]?.t || 0;
  const speed = Math.max(1, end / 12);
  const start = performance.now();
  let angle = 0;
  let lastT = 0;
  let i = 0;
  let raf = 0;
  let stopped = false;
  const tick = (now: number) => {
    if (stopped) return;
    const t = Math.min(end, ((now - start) / 1000) * speed);
    while (i + 1 < samples.length && samples[i + 1].t <= t) i++;
    const s = samples[i];
    const next = samples[Math.min(i + 1, samples.length - 1)];
    const f = next.t > s.t ? (t - s.t) / (next.t - s.t) : 0;
    const h = s.h + (next.h - s.h) * f;
    const rpm = s.inputRpm + (next.inputRpm - s.inputRpm) * f;
    angle += ((rpm * 2 * Math.PI) / 60) * (t - lastT) * (m.input.kind === "motor" ? 0.05 : 1);
    lastT = t;
    onFrame({ inputAngle: angle, loadHeight: h });
    if (t < end) raf = requestAnimationFrame(tick);
    else onDone?.();
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
