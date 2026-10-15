"use client";

import React, { useEffect, useRef } from "react";
import type { DriveSim } from "@/lib/studio/drive/physics";

/**
 * Top-down view of the robot on its track: the dark line, the robot to scale with its wheels and
 * line sensors (they light up over the line), the path it has driven, and live numbers.
 */
export function TrackView({ drive, running, className }: { drive: DriveSim; running: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  // draw on every render: the page re-renders each simulation frame
  useEffect(() => {
    const cv = canvas.current;
    const host = box.current;
    if (!cv || !host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#e8eef5";
    g.fillRect(0, 0, W, H);

    const { track, robot } = drive;
    const xs: number[] = track.pts.map((p) => p[0]);
    const zs: number[] = track.pts.map((p) => p[1]);
    if (track.arena) xs.push(-track.arena.width / 2, track.arena.width / 2), zs.push(-track.arena.depth / 2, track.arena.depth / 2);
    for (const o of track.obstacles) {
      const ex = o.shape === "box" ? o.w / 2 : o.r;
      const ez = o.shape === "box" ? o.d / 2 : o.r;
      xs.push(o.x - ex, o.x + ex);
      zs.push(o.z - ez, o.z + ez);
    }
    if (!xs.length) xs.push(-300, 300), zs.push(-300, 300);
    const pad = track.arena ? 30 : 70;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minZ = Math.min(...zs) - pad;
    const maxZ = Math.max(...zs) + pad;
    const k = Math.min(W / (maxX - minX), H / (maxZ - minZ));
    const ox = (W - (maxX - minX) * k) / 2 - minX * k;
    const oy = (H - (maxZ - minZ) * k) / 2 - minZ * k;
    const X = (x: number) => x * k + ox;
    const Y = (z: number) => z * k + oy;

    // walls and obstacles
    if (track.arena) {
      g.strokeStyle = "#475569";
      g.lineWidth = 4;
      g.strokeRect(X(-track.arena.width / 2), Y(-track.arena.depth / 2), track.arena.width * k, track.arena.depth * k);
    }
    for (const o of track.obstacles) {
      g.fillStyle = "#f59e0b";
      g.strokeStyle = "#b45309";
      g.lineWidth = 2;
      if (o.shape === "box") {
        g.fillRect(X(o.x - o.w / 2), Y(o.z - o.d / 2), o.w * k, o.d * k);
        g.strokeRect(X(o.x - o.w / 2), Y(o.z - o.d / 2), o.w * k, o.d * k);
      } else {
        g.beginPath();
        g.arc(X(o.x), Y(o.z), o.r * k, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }

    // the line
    if (track.pts.length >= 2) {
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#0b1220";
    g.lineWidth = Math.max(2, track.width * k);
    g.beginPath();
    track.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
    if (track.closed) g.closePath();
    g.stroke();
    }

    // start marker
    g.fillStyle = "#16a34a";
    g.beginPath();
    g.arc(X(track.start.x), Y(track.start.z), Math.max(3, 5 * k * 2), 0, Math.PI * 2);
    g.fill();

    // path driven
    if (drive.trail.length > 1) {
      g.strokeStyle = "#14b8a6";
      g.lineWidth = Math.max(1.5, 2.5 * k * 2);
      g.beginPath();
      drive.trail.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      g.stroke();
    }

    // robot (drawn in its own frame: nose up at heading 0)
    const { pose } = drive;
    g.save();
    g.translate(X(pose.x), Y(pose.z));
    g.rotate(-pose.h);
    g.scale(k, k);
    const half = robot.trackWidth / 2;
    const ww = robot.wheelWidth;
    const L = robot.length;
    g.fillStyle = "rgba(14,116,144,0.85)";
    g.fillRect(-(half - ww / 2), -L * 0.6, robot.trackWidth - ww, L);
    g.fillStyle = "#1f2937";
    for (const sx of [-1, 1]) g.fillRect(sx * half - ww / 2, -robot.wheelRadius, ww, robot.wheelRadius * 2);
    g.fillStyle = "#fbbf24";
    g.beginPath();
    g.moveTo(0, -L * 0.6 - 14);
    g.lineTo(-10, -L * 0.6 + 2);
    g.lineTo(10, -L * 0.6 + 2);
    g.closePath();
    g.fill();
    for (const s of robot.sensors) {
      const v = drive.read(s);
      g.fillStyle = s.kind === "distance" ? "#38bdf8" : v > 500 ? "#ef4444" : "#94a3b8";
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(s.x, s.z, 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();

    // numbers
    const { left, right } = drive.speeds;
    const pct = drive.time > 0 ? Math.round((drive.onLine / drive.time) * 100) : 100;
    g.fillStyle = "rgba(15,23,42,0.82)";
    g.fillRect(8, 8, 188, 62);
    g.fillStyle = "#f8fafc";
    g.font = "600 12px ui-monospace, monospace";
    const lined = track.pts.length >= 2;
    g.fillText(lined ? `time ${drive.time.toFixed(1)} s   laps ${Math.max(0, drive.progress / track.length).toFixed(2)}` : `time ${drive.time.toFixed(1)} s   hits ${drive.hits}`, 16, 26);
    g.fillText(`speed ${Math.round(((left + right) / 2) / 10)} cm/s`, 16, 43);
    g.fillStyle = !lined ? "#e2e8f0" : pct >= 80 ? "#4ade80" : pct >= 50 ? "#fbbf24" : "#f87171";
    g.fillText(lined ? `on the line ${pct}%` : `distance ${Math.round(drive.distance / 10)} cm`, 16, 60);
    if (!running && drive.time === 0) {
      g.fillStyle = "rgba(15,23,42,0.7)";
      g.fillRect(W / 2 - 120, H - 36, 240, 26);
      g.fillStyle = "#f8fafc";
      g.textAlign = "center";
      g.fillText("Press Run to drive", W / 2, H - 18);
      g.textAlign = "left";
    }
  });

  return (
    <div ref={box} className={className} style={{ position: "relative", overflow: "hidden" }} aria-label="Top-down track view">
      <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
