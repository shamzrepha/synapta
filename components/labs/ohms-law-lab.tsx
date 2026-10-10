"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, CheckCircle2, Sparkles } from "lucide-react";

export interface LabProps {
  config?: Record<string, number | string>;
  onComplete: (result: { success: boolean; detail: string }) => void;
}

export function OhmsLawLab({ config = {}, onComplete }: LabProps) {
  const targetCurrent = typeof config.targetCurrent === "number" ? config.targetCurrent : 0.12; // 120 mA
  const maxPower = typeof config.maxPower === "number" ? config.maxPower : 1.5; // 1.5 Watts

  const [voltage, setVoltage] = useState<number>(12); // Volts
  const [resistance, setResistance] = useState<number>(100); // Ohms
  const [completed, setCompleted] = useState<boolean>(false);

  // Physical calculations
  const current = voltage / Math.max(1, resistance); // I = V / R (Amps)
  const power = Math.pow(current, 2) * resistance; // P = I^2 * R (Watts)

  // Target criteria: current within ± 0.015 A of target AND power <= maxPower
  const isTargetCurrent = Math.abs(current - targetCurrent) <= 0.015;
  const isPowerSafe = power <= maxPower;
  const isGoalMet = isTargetCurrent && isPowerSafe;

  const handleVerify = () => {
    if (isGoalMet && !completed) {
      setCompleted(true);
      onComplete({
        success: true,
        detail: `Achieved ${current.toFixed(3)} A safely at ${power.toFixed(2)} W dissipation.`,
      });
    }
  };

  const handleReset = () => {
    setVoltage(12);
    setResistance(100);
    setCompleted(false);
  };

  return (
    <div className="space-y-6 select-none">
      {/* Objective & Instructions Banner */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="amber" className="text-xs">Lab Mission</Badge>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Tune circuit to target current I = {(targetCurrent * 1000).toFixed(0)} mA without exceeding P_max = {maxPower} W.
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Use the voltage and resistance sliders to adjust physical parameters in real time.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={handleReset} className="text-xs shrink-0">
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Apparatus
        </Button>
      </div>

      {/* SVG Interactive Circuit Schematic */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <svg viewBox="0 0 500 240" className="w-full max-w-lg h-auto">
          {/* Outer Circuit Loop */}
          <rect
            x="50"
            y="30"
            width="400"
            height="180"
            rx="12"
            fill="none"
            stroke="#64748B"
            strokeWidth="4"
          />

          {/* Animated Electron Flow Dots */}
          <circle r="4" fill="#14B8A6">
            <animateMotion
              path="M 50,30 L 450,30 L 450,210 L 50,210 Z"
              dur={`${Math.max(0.6, 4 / Math.max(0.01, current * 8))}s`}
              repeatCount="indefinite"
            />
          </circle>
          <circle r="4" fill="#14B8A6">
            <animateMotion
              path="M 50,30 L 450,30 L 450,210 L 50,210 Z"
              dur={`${Math.max(0.6, 4 / Math.max(0.01, current * 8))}s`}
              begin="0.5s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="4" fill="#14B8A6">
            <animateMotion
              path="M 50,30 L 450,30 L 450,210 L 50,210 Z"
              dur={`${Math.max(0.6, 4 / Math.max(0.01, current * 8))}s`}
              begin="1.0s"
              repeatCount="indefinite"
            />
          </circle>

          {/* DC Voltage Source (Left Branch) */}
          <g transform="translate(50, 120)">
            <rect x="-24" y="-30" width="48" height="60" rx="8" fill="#1E293B" />
            <text x="0" y="-8" textAnchor="middle" fill="#38BDF8" fontSize="11" fontWeight="bold">
              {voltage.toFixed(1)} V
            </text>
            <text x="0" y="16" textAnchor="middle" fill="#94A3B8" fontSize="9">
              DC Source
            </text>
          </g>

          {/* Resistor (Top Branch) */}
          <g transform="translate(250, 30)">
            <rect x="-35" y="-18" width="70" height="36" rx="8" fill={power > maxPower ? "#BE123C" : "#0F766E"} />
            <text x="0" y="4" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">
              {resistance} Ω
            </text>
            <text x="0" y="-22" textAnchor="middle" fill="#64748B" fontSize="9">
              Resistor R
            </text>
          </g>

          {/* Ammeter Display (Right Branch) */}
          <g transform="translate(450, 120)">
            <circle cx="0" cy="0" r="26" fill="#1E293B" stroke="#14B8A6" strokeWidth="2" />
            <text x="0" y="-2" textAnchor="middle" fill="#14B8A6" fontSize="10" fontWeight="bold">
              {(current * 1000).toFixed(0)} mA
            </text>
            <text x="0" y="12" textAnchor="middle" fill="#94A3B8" fontSize="8">
              Ammeter
            </text>
          </g>

          {/* Power Monitor (Bottom Branch) */}
          <g transform="translate(250, 210)">
            <rect x="-40" y="-16" width="80" height="32" rx="6" fill="#1E293B" />
            <text
              x="0"
              y="4"
              textAnchor="middle"
              fill={power > maxPower ? "#F43F5E" : "#F59E0B"}
              fontSize="10"
              fontWeight="bold"
            >
              {power.toFixed(2)} W
            </text>
          </g>
        </svg>

        {/* Real-Time Telemetry Cards */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-lg pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Circuit Current</span>
            <span className={`text-base font-bold ${isTargetCurrent ? "text-emerald-500" : "text-slate-900 dark:text-slate-100"}`}>
              {(current * 1000).toFixed(1)} mA
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Power Dissipated</span>
            <span className={`text-base font-bold ${power > maxPower ? "text-rose-500" : "text-amber-500"}`}>
              {power.toFixed(3)} W
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Status</span>
            <span className={`text-xs font-bold ${isGoalMet ? "text-emerald-500" : "text-slate-400"}`}>
              {power > maxPower ? "⚠️ Overheated!" : isTargetCurrent ? "Target Hit" : "Adjusting"}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Controls Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Supply Voltage: V</span>
            <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{voltage} Volts</span>
          </div>
          <input
            type="range"
            min="1"
            max="24"
            step="0.5"
            value={voltage}
            onChange={(e) => setVoltage(parseFloat(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>1 V</span>
            <span>12 V</span>
            <span>24 V</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Resistor Rating: R</span>
            <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{resistance} Ohms</span>
          </div>
          <input
            type="range"
            min="10"
            max="300"
            step="5"
            value={resistance}
            onChange={(e) => setResistance(parseInt(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>10 Ω</span>
            <span>150 Ω</span>
            <span>300 Ω</span>
          </div>
        </div>
      </div>

      {/* Completion & Verification Trigger */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          {completed ? (
            <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Lab Completed! +30 XP awarded to your Cognitive Twin.
            </span>
          ) : isGoalMet ? (
            <span className="flex items-center gap-1.5 font-bold text-teal-600 dark:text-teal-400">
              <Sparkles className="h-4 w-4" /> Target reached! Click verify to record evidence.
            </span>
          ) : (
            <span>
              Adjust parameters until current is near {(targetCurrent * 1000).toFixed(0)} mA with power &le; {maxPower} W.
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
