"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, CheckCircle2, Sparkles, Play } from "lucide-react";
import { LabProps } from "./ohms-law-lab";

export function ProjectileLab({ config = {}, onComplete }: LabProps) {
  const targetDistance = typeof config.targetDistance === "number" ? config.targetDistance : 120; // 120 meters
  const tolerance = typeof config.tolerance === "number" ? config.tolerance : 6; // +/- 6 meters

  const [angle, setAngle] = useState<number>(45); // Degrees
  const [speed, setSpeed] = useState<number>(35); // m/s
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [hasLaunched, setHasLaunched] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);

  const g = 9.8; // m/s^2
  const angleRad = (angle * Math.PI) / 180;
  const range = (Math.pow(speed, 2) * Math.sin(2 * angleRad)) / g;
  const maxHeight = Math.pow(speed * Math.sin(angleRad), 2) / (2 * g);
  const flightTime = (2 * speed * Math.sin(angleRad)) / g;

  const isHit = Math.abs(range - targetDistance) <= tolerance;

  const handleLaunch = () => {
    setIsLaunching(true);
    setHasLaunched(true);

    setTimeout(() => {
      setIsLaunching(false);
      if (isHit && !completed) {
        setCompleted(true);
        onComplete({
          success: true,
          detail: `Hit target at ${range.toFixed(1)} m (target was ${targetDistance} m) at launch angle ${angle}°.`,
        });
      }
    }, 1200);
  };

  const handleReset = () => {
    setAngle(45);
    setSpeed(35);
    setHasLaunched(false);
    setIsLaunching(false);
    setCompleted(false);
  };

  // Generate Trajectory SVG curve
  // Scale down max distance (e.g. 200m) to fit SVG 450px width
  const maxScaleX = 220; // 220m
  const scaleX = (x: number) => 40 + (x / maxScaleX) * 400;
  const scaleY = (y: number) => 180 - (y / 80) * 150; // max height scale 80m

  const curvePoints = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = (flightTime * i) / steps;
    const x = speed * Math.cos(angleRad) * t;
    const y = Math.max(0, speed * Math.sin(angleRad) * t - 0.5 * g * Math.pow(t, 2));
    curvePoints.push(`${scaleX(x).toFixed(1)},${scaleY(y).toFixed(1)}`);
  }
  const trajectoryPath = `M ${curvePoints.join(" L ")}`;

  return (
    <div className="space-y-6 select-none">
      {/* Objective Banner */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="amber" className="text-xs">Lab Mission</Badge>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Launch ballistic projectile to hit the target at {targetDistance} m (&plusmn;{tolerance} m).
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Formula: R = (v₀² &middot; sin(2&theta;)) / g. Adjust launch angle and initial velocity.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={handleReset} className="text-xs shrink-0">
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Trajectory
        </Button>
      </div>

      {/* SVG Ballistic Trajectory Viewport */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col items-center justify-center">
        <svg viewBox="0 0 480 220" className="w-full max-w-lg h-auto">
          {/* Ground surface */}
          <line x1="20" y1="180" x2="460" y2="180" stroke="#475569" strokeWidth="3" />

          {/* Cannon / Launcher base */}
          <circle cx="40" cy="180" r="14" fill="#0F766E" />
          <line
            x1="40"
            y1="180"
            x2={40 + 24 * Math.cos(angleRad)}
            y2={180 - 24 * Math.sin(angleRad)}
            stroke="#14B8A6"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Target Flag Marker */}
          <g transform={`translate(${scaleX(targetDistance)}, 180)`}>
            {/* Target base area zone */}
            <rect
              x={-((tolerance / maxScaleX) * 400)}
              y="-4"
              width={(tolerance / maxScaleX) * 800}
              height="8"
              fill="#10B981"
              fillOpacity="0.3"
              rx="4"
            />
            {/* Flagpole */}
            <line x1="0" y1="0" x2="0" y2="-40" stroke="#F59E0B" strokeWidth="2" />
            <polygon points="0,-40 20,-30 0,-20" fill="#F59E0B" />
            <text x="0" y="14" textAnchor="middle" fill="#94A3B8" fontSize="8">
              Target ({targetDistance}m)
            </text>
          </g>

          {/* Trajectory Arc */}
          <path
            d={trajectoryPath}
            fill="none"
            stroke="#14B8A6"
            strokeWidth="2.5"
            strokeDasharray={hasLaunched ? "none" : "4 4"}
          />

          {/* Animated Projectile Ball */}
          {isLaunching && (
            <circle r="6" fill="#F59E0B">
              <animateMotion
                path={trajectoryPath}
                dur="1.2s"
                repeatCount="1"
                fill="freeze"
              />
            </circle>
          )}

          {/* Impact Point Marker */}
          {hasLaunched && !isLaunching && (
            <g transform={`translate(${scaleX(range)}, 180)`}>
              <circle cx="0" cy="0" r="5" fill={isHit ? "#10B981" : "#EF4444"} />
              <text x="0" y="-10" textAnchor="middle" fill={isHit ? "#10B981" : "#EF4444"} fontSize="9" fontWeight="bold">
                {range.toFixed(1)}m
              </text>
            </g>
          )}
        </svg>

        {/* Telemetry Metrics */}
        <div className="grid grid-cols-4 gap-2 w-full max-w-lg pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Calculated Range</span>
            <span className={`text-sm font-bold ${isHit ? "text-emerald-500" : "text-teal-600 dark:text-teal-400"}`}>
              {range.toFixed(1)} m
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Max Apex</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {maxHeight.toFixed(1)} m
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Flight Time</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {flightTime.toFixed(2)} s
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Target Accuracy</span>
            <span className={`text-sm font-bold ${isHit ? "text-emerald-500" : "text-amber-500"}`}>
              {isHit ? "DIRECT HIT" : `${Math.abs(range - targetDistance).toFixed(1)}m off`}
            </span>
          </div>
        </div>
      </div>

      {/* Sliders & Launch Button */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold">Launch Angle θ</span>
            <span className="font-mono text-teal-600 font-bold">{angle}°</span>
          </div>
          <input
            type="range"
            min="10"
            max="80"
            step="1"
            value={angle}
            onChange={(e) => setAngle(parseInt(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold">Initial Speed v₀</span>
            <span className="font-mono text-teal-600 font-bold">{speed} m/s</span>
          </div>
          <input
            type="range"
            min="10"
            max="50"
            step="1"
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
        </div>

        <div className="flex items-end">
          <Button
            size="default"
            className="w-full text-xs font-bold"
            onClick={handleLaunch}
            isLoading={isLaunching}
          >
            <Play className="h-4 w-4 mr-1.5 fill-current" /> Fire Projectile
          </Button>
        </div>
      </div>

      {/* Completion Banner */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          {completed ? (
            <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Lab Completed! Target distance struck successfully (+30 XP).
            </span>
          ) : isHit && hasLaunched ? (
            <span className="flex items-center gap-1.5 font-bold text-teal-600 dark:text-teal-400">
              <Sparkles className="h-4 w-4" /> Target reached! Recording Bayesian evidence...
            </span>
          ) : (
            <span>
              Target is at {targetDistance} m. Adjust velocity and angle to hit the zone.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
