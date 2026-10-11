"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, CheckCircle2 } from "lucide-react";
import { LabProps } from "./ohms-law-lab";

export function LogicGatesLab({ onComplete }: LabProps) {
  const [inputA, setInputA] = useState<boolean>(false);
  const [inputB, setInputB] = useState<boolean>(false);
  const [testedCombinations, setTestedCombinations] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState<boolean>(false);

  // Digital calculations
  const sum = inputA !== inputB; // XOR gate
  const carry = inputA && inputB; // AND gate

  const stateKey = `${inputA ? 1 : 0}_${inputB ? 1 : 0}`;

  const handleTestState = () => {
    const nextTested = { ...testedCombinations, [stateKey]: true };
    setTestedCombinations(nextTested);

    // Goal: All 4 states (00, 01, 10, 11) tested
    const allFourTested = ["0_0", "0_1", "1_0", "1_1"].every((k) => nextTested[k]);
    if (allFourTested && !completed) {
      setCompleted(true);
      onComplete({
        success: true,
        detail: "Verified full 4-state binary Half Adder truth table (XOR sum + AND carry).",
        parameters: { testedCombinations: Object.keys(nextTested) },
      });
    }
  };

  const handleReset = () => {
    setInputA(false);
    setInputB(false);
    setTestedCombinations({});
    setCompleted(false);
  };

  const testedCount = Object.keys(testedCombinations).length;

  return (
    <div className="space-y-6 select-none">
      {/* Objective Banner */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="amber" className="text-xs">Lab Mission</Badge>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Verify the 1-bit Binary Half Adder by validating all 4 input combinations.
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Sum output is computed by XOR (\(A \oplus B\)); Carry output is computed by AND (\(A \cdot B\)).
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={handleReset} className="text-xs shrink-0">
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Test Matrix
        </Button>
      </div>

      {/* Interactive Circuit Canvas */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col items-center justify-center">
        <svg viewBox="0 0 480 220" className="w-full max-w-lg h-auto">
          {/* Input Toggle Switches */}
          {/* Input A */}
          <g transform="translate(60, 60)">
            <rect x="-30" y="-18" width="60" height="36" rx="8" fill={inputA ? "#0D9488" : "#334155"} />
            <text x="0" y="4" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">
              A = {inputA ? 1 : 0}
            </text>
          </g>

          {/* Input B */}
          <g transform="translate(60, 160)">
            <rect x="-30" y="-18" width="60" height="36" rx="8" fill={inputB ? "#0D9488" : "#334155"} />
            <text x="0" y="4" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">
              B = {inputB ? 1 : 0}
            </text>
          </g>

          {/* Wiring */}
          {/* A to XOR and AND */}
          <path d="M 90,60 L 220,60" fill="none" stroke={inputA ? "#14B8A6" : "#475569"} strokeWidth="3" />
          <path d="M 140,60 L 140,140 L 220,140" fill="none" stroke={inputA ? "#14B8A6" : "#475569"} strokeWidth="3" />

          {/* B to XOR and AND */}
          <path d="M 90,160 L 170,160 L 170,80 L 220,80" fill="none" stroke={inputB ? "#14B8A6" : "#475569"} strokeWidth="3" />
          <path d="M 90,160 L 220,160" fill="none" stroke={inputB ? "#14B8A6" : "#475569"} strokeWidth="3" />

          {/* XOR Gate (Sum) */}
          <g transform="translate(260, 70)">
            <rect x="-40" y="-25" width="80" height="50" rx="10" fill="#1E293B" stroke="#14B8A6" strokeWidth="2" />
            <text x="0" y="-4" textAnchor="middle" fill="#14B8A6" fontSize="10" fontWeight="bold">XOR Gate</text>
            <text x="0" y="12" textAnchor="middle" fill="#94A3B8" fontSize="8">Sum Bit</text>
          </g>
          {/* Wire to Sum Output */}
          <path d="M 300,70 L 380,70" fill="none" stroke={sum ? "#10B981" : "#475569"} strokeWidth="3" />

          {/* AND Gate (Carry) */}
          <g transform="translate(260, 150)">
            <rect x="-40" y="-25" width="80" height="50" rx="10" fill="#1E293B" stroke="#F59E0B" strokeWidth="2" />
            <text x="0" y="-4" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="bold">AND Gate</text>
            <text x="0" y="12" textAnchor="middle" fill="#94A3B8" fontSize="8">Carry Bit</text>
          </g>
          {/* Wire to Carry Output */}
          <path d="M 300,150 L 380,150" fill="none" stroke={carry ? "#F59E0B" : "#475569"} strokeWidth="3" />

          {/* Output Indicators */}
          {/* Sum */}
          <g transform="translate(420, 70)">
            <circle cx="0" cy="0" r="22" fill={sum ? "#059669" : "#1E293B"} stroke="#10B981" strokeWidth="2" />
            <text x="0" y="4" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">
              {sum ? 1 : 0}
            </text>
            <text x="0" y="-26" textAnchor="middle" fill="#64748B" fontSize="9">Sum</text>
          </g>

          {/* Carry */}
          <g transform="translate(420, 150)">
            <circle cx="0" cy="0" r="22" fill={carry ? "#D97706" : "#1E293B"} stroke="#F59E0B" strokeWidth="2" />
            <text x="0" y="4" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">
              {carry ? 1 : 0}
            </text>
            <text x="0" y="-26" textAnchor="middle" fill="#64748B" fontSize="9">Carry</text>
          </g>
        </svg>

        {/* Input Toggle Buttons */}
        <div className="flex items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button
            size="sm"
            variant={inputA ? "default" : "outline"}
            onClick={() => setInputA(!inputA)}
            className="text-xs"
          >
            Toggle Input A: [{inputA ? 1 : 0}]
          </Button>

          <Button
            size="sm"
            variant={inputB ? "default" : "outline"}
            onClick={() => setInputB(!inputB)}
            className="text-xs"
          >
            Toggle Input B: [{inputB ? 1 : 0}]
          </Button>

          <Button size="sm" onClick={handleTestState} className="text-xs bg-teal-600 hover:bg-teal-700 text-white">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Record Combination
          </Button>
        </div>
      </div>

      {/* Truth Table Verification Matrix */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
            Half Adder Truth Table Verification ({testedCount}/4 Verified)
          </h4>
          <span className="text-xs font-semibold text-teal-600">
            {completed ? "✓ Full Table Proved" : `${4 - testedCount} remaining`}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          {[
            { a: 0, b: 0, sum: 0, carry: 0, key: "0_0" },
            { a: 0, b: 1, sum: 1, carry: 0, key: "0_1" },
            { a: 1, b: 0, sum: 1, carry: 0, key: "1_0" },
            { a: 1, b: 1, sum: 0, carry: 1, key: "1_1" },
          ].map((row) => {
            const isRowTested = testedCombinations[row.key];
            return (
              <div
                key={row.key}
                className={`p-3 rounded-xl border transition-all ${
                  isRowTested
                    ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-100"
                    : "border-slate-200 dark:border-slate-800 opacity-60"
                }`}
              >
                <div className="font-bold text-sm mb-1">
                  A={row.a}, B={row.b}
                </div>
                <div className="text-[10px] text-slate-500">
                  Sum={row.sum}, Carry={row.carry}
                </div>
                <span className="text-[10px] font-semibold mt-1 block">
                  {isRowTested ? "✓ Verified" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
