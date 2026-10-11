import React from "react";
import { BookOpen } from "lucide-react";

export function NoneLab() {
  return (
    <div className="text-center py-16 border rounded-2xl border-dashed border-slate-200 dark:border-slate-800 space-y-4 px-4">
      <div className="h-12 w-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto">
        <BookOpen className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
          Analytical & Conceptual Topic
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          This concept is primarily theoretical or analytical, so no dedicated interactive physical simulation is required. Interactive In-Situ simulation labs are automatically assigned to circuit dynamics (Ohm&apos;s Law, RC Filters/RLC), logic gates, and mechanics/kinematics.
        </p>
      </div>
      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
        Use the <strong>Flashcards</strong> or <strong>Quiz</strong> tabs to test your active recall and update your Cognitive Twin mastery state.
      </p>
    </div>
  );
}
