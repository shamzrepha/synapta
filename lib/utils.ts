import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

export function formatPL(pL: number): string {
  return (pL * 100).toFixed(1) + "%";
}

export function getMasteryStatus(pL: number): {
  status: "unmastered" | "learning" | "mastered";
  label: string;
  colorClass: string;
} {
  if (pL >= 0.95) {
    return { status: "mastered", label: "Mastered", colorClass: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30" };
  }
  if (pL >= 0.40) {
    return { status: "learning", label: "Learning", colorClass: "text-amber-500 bg-amber-500/10 border-amber-500/30" };
  }
  return { status: "unmastered", label: "Struggling", colorClass: "text-rose-500 bg-rose-500/10 border-rose-500/30" };
}
