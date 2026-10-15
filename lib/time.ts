/** "just now", "5m", "3h", "2d", or a date for older items. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Full local date and time, e.g. "Wed, 15 Oct 2026 · 9:41 AM". */
export function exactTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** Chat-style time: "9:41 AM" today, "Yesterday", weekday this week, otherwise date. */
export function chatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
