import React from "react";
import {
  BarChart3, BookMarked, BookOpen, BrickWall, Blocks, Box, Brain, Camera, CalendarDays, CheckCircle2, ClipboardList, Clapperboard, Cog, Compass, CreditCard,
  EyeOff, FlaskConical, Flag, GraduationCap, Hand, Handshake, Layers, Mail, Megaphone, Mic, NotebookPen, Presentation, Printer, Radio, Receipt, School,
  Search, Shapes, ShoppingBag, Smile, Sparkles, Target, Timer, TrendingDown, Trophy, Users, WifiOff, Wrench, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Icon = React.ComponentType<{ className?: string }>;

/** The feature registry names each feature with an emoji. Screens show a consistent line icon instead, so the app reads as one tool. */
const ICONS: Record<string, Icon> = {
  "⚡": Zap, "✅": CheckCircle2, "✨": Sparkles, "🃏": Layers, "🍅": Timer, "🎓": GraduationCap, "🎙️": Mic, "🎬": Clapperboard, "🎯": Target, "🏁": Flag,
  "🏆": Trophy, "🏫": School, "👥": Users, "💌": Mail, "💳": CreditCard, "📉": TrendingDown, "📊": BarChart3, "📋": ClipboardList, "📓": BookOpen, "📕": BookMarked,
  "📝": NotebookPen, "📡": Radio, "📣": Megaphone, "📴": WifiOff, "📸": Camera, "🔍": Search, "🔩": Cog, "🖨️": Printer, "🗓️": CalendarDays, "🙈": EyeOff,
  "🙋": Hand, "🛍️": ShoppingBag, "🛠️": Wrench, "🟩": Blocks, "🤝": Handshake, "🧊": Box, "🧑‍🏫": Presentation, "🧒": Smile, "🧠": Brain, "🧪": FlaskConical,
  "🧭": Compass, "🧱": BrickWall, "🧾": Receipt,
};

/** A small square tile holding the feature's line icon. */
export function FeatureIcon({ emoji, className, tile = "h-9 w-9" }: { emoji: string; className?: string; tile?: string }) {
  const Icon = ICONS[emoji] ?? Shapes;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300", tile, className)} aria-hidden="true">
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}
