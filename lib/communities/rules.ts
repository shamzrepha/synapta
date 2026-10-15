import { extractHashtags } from "@/lib/social/text";

/** Pure rules for school communities. */

export const KINDS = ["school", "campus", "club"] as const;
export type CommunityKind = (typeof KINDS)[number];
export type CommunityRole = "owner" | "member";
export const MAX_POST_CHARS = 1500;
export const MAX_COMMENT_CHARS = 500;

// No 0/O/1/I so codes are easy to read out loud
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `rand` returns [0,1); injectable so tests are deterministic. */
export function generateJoinCode(rand: () => number = Math.random, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return out;
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export function validateCommunity(p: { name: string; description?: string; kind: string }): string | null {
  const name = p.name.trim();
  if (name.length < 3) return "Give the community a name (at least 3 characters).";
  if (name.length > 60) return "Name is too long (60 characters max).";
  if ((p.description || "").length > 300) return "Description is too long (300 characters max).";
  if (!(KINDS as readonly string[]).includes(p.kind)) return "Pick school, campus or club.";
  return null;
}

export function canManage(role: CommunityRole | null | undefined): boolean {
  return role === "owner";
}

/** Owners may delete anyone's post; members only their own. */
export function canDeletePost(role: CommunityRole | null, authorUid: string, uid: string): boolean {
  return role === "owner" || authorUid === uid;
}

export function postTags(text: string): string[] {
  return extractHashtags(text);
}

export interface SortablePost {
  pinned?: boolean;
  createdAtMs: number;
}

/** Pinned announcements first, then newest first. */
export function sortPosts<T extends SortablePost>(posts: T[]): T[] {
  return [...posts].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAtMs - a.createdAtMs);
}
