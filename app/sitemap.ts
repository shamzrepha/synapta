import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/** Public pages Google may index. Dates are real edit dates: a date that changes on every request tells Google nothing. */
const PAGES: { path: string; priority: number; freq: "daily" | "weekly" | "monthly" | "yearly"; updated: string }[] = [
  { path: "", priority: 1.0, freq: "daily", updated: "2026-11-24" },
  { path: "/founder", priority: 0.95, freq: "weekly", updated: "2026-11-20" },
  { path: "/about", priority: 0.95, freq: "weekly", updated: "2026-11-20" },
  { path: "/ambassador", priority: 0.8, freq: "weekly", updated: "2026-11-24" },
  { path: "/explore", priority: 0.9, freq: "daily", updated: "2026-11-24" },
  { path: "/signup", priority: 0.7, freq: "monthly", updated: "2026-11-01" },
  { path: "/login", priority: 0.5, freq: "monthly", updated: "2026-11-01" },
  { path: "/privacy", priority: 0.4, freq: "yearly", updated: "2026-11-20" },
  { path: "/terms", priority: 0.4, freq: "yearly", updated: "2026-11-20" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  return PAGES.map((p) => ({ url: `${baseUrl}${p.path}`, lastModified: new Date(p.updated), changeFrequency: p.freq, priority: p.priority }));
}
