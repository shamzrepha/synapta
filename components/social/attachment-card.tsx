"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SharedAttachment {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  emoji?: string;
}

const TYPE_LABEL: Record<string, { label: string; emoji: string }> = {
  post: { label: "Post", emoji: "📝" },
  room: { label: "Study room", emoji: "🚪" },
  event: { label: "Challenge", emoji: "⚔️" },
  notebook: { label: "Notebook", emoji: "📓" },
  badge: { label: "Achievement", emoji: "🏆" },
  topic: { label: "Topic", emoji: "📚" },
  session: { label: "Study session", emoji: "📅" },
  profile: { label: "Profile", emoji: "👤" },
  class: { label: "Class", emoji: "🎓" },
};

/** Rich preview card for anything shared into the feed or a chat. */
export function AttachmentCard({ a, compact = false, className }: { a: SharedAttachment; compact?: boolean; className?: string }) {
  const meta = TYPE_LABEL[a.type] || TYPE_LABEL.post;
  return (
    <Link
      href={a.href}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:border-teal-500/60 transition-colors",
        compact ? "p-2.5" : "p-3.5",
        className
      )}
    >
      <span className={cn("shrink-0 rounded-xl bg-gradient-to-br from-teal-500/15 to-indigo-500/15 flex items-center justify-center", compact ? "h-10 w-10 text-xl" : "h-12 w-12 text-2xl")}>
        {a.emoji || meta.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">{meta.label}</span>
        <span className="block text-sm font-semibold truncate">{a.title}</span>
        {a.subtitle && <span className="block text-xs text-slate-500 truncate">{a.subtitle}</span>}
      </span>
    </Link>
  );
}
