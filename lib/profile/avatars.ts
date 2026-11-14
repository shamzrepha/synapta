/** Starter avatars (a colour and a face) for people who don't want to upload a picture. Built on the server from the index only. */
export const AVATAR_PRESETS: { bg: string; fg: string; face: string }[] = [
  { bg: "#4A6CF7", fg: "#FFFFFF", face: "🌱" },
  { bg: "#0EA5E9", fg: "#FFFFFF", face: "🚀" },
  { bg: "#10B981", fg: "#FFFFFF", face: "🧪" },
  { bg: "#F59E0B", fg: "#1F2937", face: "⚡" },
  { bg: "#EF4444", fg: "#FFFFFF", face: "🔥" },
  { bg: "#8B5CF6", fg: "#FFFFFF", face: "🧠" },
  { bg: "#EC4899", fg: "#FFFFFF", face: "🎨" },
  { bg: "#14B8A6", fg: "#FFFFFF", face: "🔬" },
  { bg: "#6366F1", fg: "#FFFFFF", face: "📐" },
  { bg: "#F97316", fg: "#FFFFFF", face: "🤖" },
  { bg: "#22C55E", fg: "#FFFFFF", face: "🌍" },
  { bg: "#0F172A", fg: "#FFFFFF", face: "🎧" },
];

export function presetAvatarUrl(index: number): string | null {
  const p = AVATAR_PRESETS[index];
  if (!p) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${p.bg}"/><text x="48" y="64" font-size="48" text-anchor="middle">${p.face}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const RESERVED = new Set(["admin", "administrator", "support", "sunroot", "sunrootlearn", "sprout", "root", "system", "moderator", "help", "staff", "team", "official", "null", "undefined"]);

/** The rules a handle must meet: 3 to 24 lowercase letters, digits or underscores, and not a name that sounds official. */
export function checkUsername(input: string): { ok: true; username: string } | { ok: false; message: string } {
  const username = input.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return { ok: false, message: "Use 3 to 24 letters, numbers or underscores." };
  if (RESERVED.has(username)) return { ok: false, message: "That name is reserved. Pick another." };
  return { ok: true, username };
}

/** True when the bytes start like a JPEG, so only a real picture is stored. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
