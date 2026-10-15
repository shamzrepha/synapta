/** Presence in a shared design: colours and freshness. */
export const PRESENCE_TTL_MS = 45_000;
export const PRESENCE_HEARTBEAT_MS = 20_000;

const PALETTE = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

/** A stable colour per person (same on every device). */
export function presenceColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export interface Presence {
  uid: string;
  name: string;
  color: string;
  selected: string | null;
  editing: boolean;
  tab: string | null;
}

/** Short text such as "Ada is editing arm_left" for tooltips. */
export function presenceLabel(p: Presence): string {
  return `${p.name} ${p.editing ? "is editing" : "is viewing"}${p.selected ? ` · ${p.selected}` : ""}`;
}
