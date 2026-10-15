import { countLinks, startOfUtcDay } from "@/lib/community/util";

export const SHOUTOUT_BADGES = [
  { id: "thanks", label: "Thanks", emoji: "🙏" },
  { id: "great_explanation", label: "Great explanation", emoji: "💡" },
  { id: "clutch_help", label: "Clutch help", emoji: "🛟" },
  { id: "team_player", label: "Team player", emoji: "🤝" },
  { id: "patient", label: "So patient", emoji: "🌱" },
  { id: "inspiring", label: "Inspiring", emoji: "🌟" },
] as const;

export type ShoutoutBadge = (typeof SHOUTOUT_BADGES)[number]["id"];
export const BADGE_IDS = SHOUTOUT_BADGES.map((b) => b.id) as [ShoutoutBadge, ...ShoutoutBadge[]];

export const SHOUTOUT_LIMITS = { perDay: 5, perRecipientPerDay: 1, message: 200 };

export function badgeInfo(id: string) {
  return SHOUTOUT_BADGES.find((b) => b.id === id) || SHOUTOUT_BADGES[0];
}

export interface SentRecord {
  toUid: string;
  createdAtMs: number;
}

export type SendCheck = { ok: true } | { ok: false; code: "SELF" | "DAILY_LIMIT" | "ALREADY_TODAY"; message: string };

/** Whether `fromUid` may send another shout-out to `toUid`, given what they already sent. */
export function canSendShoutout(fromUid: string, toUid: string, sent: SentRecord[], now: number): SendCheck {
  if (fromUid === toUid) return { ok: false, code: "SELF", message: "You can't send a shout-out to yourself." };
  const today = startOfUtcDay(now);
  const todays = sent.filter((s) => s.createdAtMs >= today);
  if (todays.length >= SHOUTOUT_LIMITS.perDay) return { ok: false, code: "DAILY_LIMIT", message: `You can send ${SHOUTOUT_LIMITS.perDay} shout-outs a day. Come back tomorrow.` };
  if (todays.filter((s) => s.toUid === toUid).length >= SHOUTOUT_LIMITS.perRecipientPerDay) {
    return { ok: false, code: "ALREADY_TODAY", message: "You already thanked this person today." };
  }
  return { ok: true };
}

export function validateMessage(raw: string): { ok: true; text: string } | { ok: false; message: string } {
  const text = raw.trim();
  if (text.length < 2) return { ok: false, message: "Add a short message." };
  if (text.length > SHOUTOUT_LIMITS.message) return { ok: false, message: `Keep it under ${SHOUTOUT_LIMITS.message} characters.` };
  if (countLinks(text) > 0) return { ok: false, message: "Links aren't allowed in shout-outs." };
  return { ok: true, text };
}

export function badgeCounts(items: { badge: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.badge] = (out[i.badge] || 0) + 1;
  return out;
}
