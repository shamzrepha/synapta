"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, CheckCircle2, Sparkles } from "lucide-react";
import { LabProps } from "./ohms-law-lab";

export function RcFilterLab({ config = {}, onComplete }: LabProps) {
  const targetCutoff = typeof config.targetCutoff === "number" ? config.targetCutoff : 1000; // 1000 Hz target

  const [resistance, setResistance] = useState<number>(1000); // 1000 Ohms (1 kOhm)
  const [capacitanceMicro, setCapacitanceMicro] = useState<number>(0.16); // 0.16 microFarads
  const [testFrequency, setTestFrequency] = useState<number>(1000); // 1000 Hz input frequency
  const [completed, setCompleted] = useState<boolean>(false);

  // Physical calculations
  const capacitanceFarads = capacitanceMicro * 1e-6;
  const cutoffFrequency = 1 / (2 * Math.PI * resistance * capacitanceFarads);

  // Gain at test frequency: G = 1 / sqrt(1 + (f / fc)^2)
  const gain = 1 / Math.sqrt(1 + Math.pow(testFrequency / cutoffFrequency, 2));
  const gainDb = 20 * Math.log10(Math.max(1e-5, gain));
  const phaseDeg = -Math.atan(testFrequency / cutoffFrequency) * (180 / Math.PI);

  // Success criteria: fc within 5% of targetCutoff
  const percentageError = Math.abs(cutoffFrequency - targetCutoff) / targetCutoff;
  const isGoalMet = percentageError <= 0.05;

  const handleVerify = () => {
    if (isGoalMet && !completed) {
      setCompleted(true);
      onComplete({
        success: true,
        detail: `Tuned RC filter cutoff to ${cutoffFrequency.toFixed(1)} Hz (target: ${targetCutoff} Hz).`,
      });
    }
  };

  const handleReset = () => {
    setResistance(1000);
    setCapacitanceMicro(0.5);
    setTestFrequency(1000);
    setCompleted(false);
  };

  // Generate SVG frequency curve points
  const points = [];
  for (let f = 50; f <= 5000; f += 100) {
    const g = 1 / Math.sqrt(1 + Math.pow(f / cutoffFrequency, 2));
    const x = ((Math.log10(f) - Math.log10(50)) / (Math.log10(5000) - Math.log10(50))) * 380 + 40;
    const y = 160 - g * 120;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const svgPath = `M ${points.join(" L ")}`;

  return (
    <div className="space-y-6 select-none">
      {/* Objective Banner */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="amber" className="text-xs">Lab Mission</Badge>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Tune RC Low-Pass filter cutoff frequency to {targetCutoff} Hz within 5% tolerance.
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Formula: f_c = 1 / (2&pi;RC). Observe the frequency response curve and -3dB attenuation point.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={handleReset} className="text-xs shrink-0">
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Apparatus
        </Button>
      </div>

      {/* SVG Frequency Response Curve */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col items-center justify-center">
        <svg viewBox="0 0 460 200" className="w-full max-w-lg h-auto">
          {/* Grid lines */}
          <line x1="40" y1="40" x2="420" y2="40" stroke="#334155" strokeDasharray="3 3" />
          <line x1="40" y1="100" x2="420" y2="100" stroke="#334155" strokeDasharray="3 3" />
          <line x1="40" y1="160" x2="420" y2="160" stroke="#64748B" strokeWidth="2" />
          <line x1="40" y1="20" x2="40" y2="160" stroke="#64748B" strokeWidth="2" />

          {/* Grid labels */}
          <text x="32" y="44" textAnchor="end" fill="#94A3B8" fontSize="9">1.0 (0 dB)</text>
          <text x="32" y="104" textAnchor="end" fill="#94A3B8" fontSize="9">0.7 (-3 dB)</text>
          <text x="32" y="164" textAnchor="end" fill="#94A3B8" fontSize="9">0.0</text>
          <text x="40" y="178" fill="#94A3B8" fontSize="9">50 Hz</text>
          <text x="230" y="178" fill="#94A3B8" fontSize="9">1 kHz</text>
          <text x="420" y="178" textAnchor="end" fill="#94A3B8" fontSize="9">5 kHz</text>

          {/* Frequency Response Curve */}
          <path d={svgPath} fill="none" stroke="#14B8A6" strokeWidth="3" />

          {/* Current Test Frequency Marker */}
          {(() => {
            const clampedFreq = Math.min(5000, Math.max(50, testFrequency));
            const markerX = ((Math.log10(clampedFreq) - Math.log10(50)) / (Math.log10(5000) - Math.log10(50))) * 380 + 40;
            const markerY = 160 - gain * 120;
            return (
              <g>
                <circle cx={markerX} cy={markerY} r="6" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="2" />
                <line x1={markerX} y1={markerY} x2={markerX} y2="160" stroke="#F59E0B" strokeDasharray="2 2" />
              </g>
            );
          })()}
        </svg>

        {/* Real-time Telemetry Grid */}
        <div className="grid grid-cols-4 gap-2 w-full max-w-lg pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Cutoff fc</span>
            <span className={`text-sm font-bold ${isGoalMet ? "text-emerald-500" : "text-teal-600 dark:text-teal-400"}`}>
              {cutoffFrequency.toFixed(0)} Hz
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Gain @ f</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {gain.toFixed(2)}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Attenuation</span>
            <span className="text-sm font-bold text-amber-500">
              {gainDb.toFixed(1)} dB
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Phase Shift</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {phaseDeg.toFixed(0)}°
            </span>
          </div>
        </div>
      </div>

      {/* Parameter Tuning Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold">Resistor R</span>
            <span className="font-mono text-teal-600 font-bold">{resistance} Ω</span>
          </div>
          <input
            type="range"
            min="100"
            max="10000"
            step="50"
            value={resistance}
            onChange={(e) => setResistance(parseInt(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold">Capacitor C</span>
            <span className="font-mono text-teal-600 font-bold">{capacitanceMicro.toFixed(2)} μF</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="2.0"
            step="0.01"
            value={capacitanceMicro}
            onChange={(e) => setCapacitanceMicro(parseFloat(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold">Test Frequency f</span>
            <span className="font-mono text-amber-500 font-bold">{testFrequency} Hz</span>
          </div>
          <input
            type="range"
            min="100"
            max="4000"
            step="50"
            value={testFrequency}
            onChange={(e) => setTestFrequency(parseInt(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Completion Section */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          {completed ? (
            <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Lab Completed! Cutoff matched within 5%.
            </span>
          ) : isGoalMet ? (
            <span className="flex items-center gap-1.5 font-bold text-teal-600 dark:text-teal-400">
              <Sparkles className="h-4 w-4" /> Cutoff {cutoffFrequency.toFixed(0)} Hz is within 5% of target!
            </span>
          ) : (
            <span>
              Target: {targetCutoff} Hz. Current error: {(percentageError * 100).toFixed(1)}%. Tune R and C to match.
            </span>
          )}
        </div>

        <Button
          size="sm"
          onClick={handleVerify}
          disabled={!isGoalMet || completed}
          className="text-xs shrink-0"
        >
          {completed ? "Completed" : "Verify & Submit Evidence"}
        </Button>
      </div>
    </div>
  );
}
