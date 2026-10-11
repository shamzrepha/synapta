import React from "react";
import { BrainCircuit } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center animate-pulse">
          <BrainCircuit className="w-6 h-6 text-teal-600 dark:text-teal-400 animate-spin" style={{ animationDuration: "3s" }} />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
          Loading Synapta
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Syncing cognitive twin state...
        </p>
      </div>
    </div>
  );
}
