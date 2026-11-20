"use client";

import { Palette } from "lucide-react";
import { ThemePanel } from "./theme-panel";

/** Settings > Colour theme: the same panel as the topbar palette button (components/settings/theme-panel.tsx). */
export function AccentPicker() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-brand-600"><Palette className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Colour theme</p>
          <p className="text-xs text-slate-500">A theme tints the whole app: backgrounds, cards, menus and buttons. Gold rewards and mastery colours stay the same. You can also open this from the palette button at the top.</p>
        </div>
      </div>
      <ThemePanel />
    </div>
  );
}
