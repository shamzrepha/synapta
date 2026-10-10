import React from "react";
import { BookOpen } from "lucide-react";

export function NoneLab() {
  return (
    <div className="text-center py-16 border rounded-2xl border-dashed border-slate-200 dark:border-slate-800 space-y-3">
      <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
        <BookOpen className="h-6 w-6" />
      </div>
      <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
        No simulation lab for this topic
      </h3>
      <p className="text-xs text-slate-500 max-w-sm mx-auto">
        This concept is purely analytical. Use the <strong>Flashcards</strong> or <strong>Quiz</strong> tabs to test your understanding and update your Cognitive Twin.
      </p>
    </div>
  );
}
