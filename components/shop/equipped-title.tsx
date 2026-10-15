"use client";

import { useEffect, useState } from "react";
import { getItem } from "@/lib/shop/catalog";

/** The student's equipped title (from the XP shop), shown on their own profile. Renders nothing if none. */
export function EquippedTitle({ className = "" }: { className?: string }) {
  const [title, setTitle] = useState<{ text: string; emoji: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop")
      .then((r) => r.json())
      .then((json) => {
        const item = json?.ok ? getItem(json.data?.equipped?.title || "") : undefined;
        if (!cancelled && item?.titleText) setTitle({ text: item.titleText, emoji: item.emoji });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!title) return null;
  return (
    <p className={`text-xs font-bold text-amber-600 dark:text-amber-400 ${className}`}>
      {title.emoji} {title.text}
    </p>
  );
}
