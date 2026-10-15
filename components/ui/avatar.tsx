import React from "react";
import { cn } from "@/lib/utils";

const COLORS = ["bg-teal-600", "bg-amber-600", "bg-indigo-600", "bg-rose-600", "bg-emerald-600", "bg-sky-600", "bg-purple-600", "bg-orange-600"];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function Avatar({
  name,
  photoURL,
  seed,
  size = 36,
  level,
  className,
}: {
  name: string;
  photoURL?: string | null;
  seed?: string;
  size?: number;
  level?: number;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoURL} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className={cn("h-full w-full rounded-full text-white font-bold flex items-center justify-center", colorFor(seed || name))}
          style={{ fontSize: Math.max(10, size * 0.4) }}
        >
          {(name || "?").charAt(0).toUpperCase()}
        </span>
      )}
      {typeof level === "number" && (
        <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[9px] font-extrabold flex items-center justify-center ring-2 ring-white dark:ring-slate-950">
          {level}
        </span>
      )}
    </span>
  );
}
