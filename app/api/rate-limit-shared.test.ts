import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The in-memory limiter is per serverless instance, so an attacker who is spread over instances multiplies the limit.
 * Every checkRateLimit call in an API route must therefore be `shared: true` (Firestore-backed), unless its keyPrefix is
 * on this short list of chatty, cheap, low-abuse endpoints (typing pings, presence, likes, telemetry). A new route that
 * forgets `shared` fails here.
 */
const API_DIR = path.join(process.cwd(), "app", "api");

const MEMORY_ONLY_OK = new Set([
  "chat_typing",
  "studio_presence",
  "telemetry",
  "read_signal",
  "flashcard-review",
  "goal-patch",
  "shop-equip",
  "tag_suggest",
  "mention_suggest",
  "school_directory",
  "focus_room",
  "studio_commit",
  "ask_upvote",
  "community_like",
  "explainer_like",
  "comment_like",
  "feed_react",
  "poll_vote",
  "audio_rerecord",
  "voice_line",
  "voice_rerecord",
  "admin_alerts",
  "client_errors",
  "follow",
  "session_rsvp",
  "studio_wall",
  "group_action",
  "pet-name",
]);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? routeFiles(p) : e.name === "route.ts" ? [p] : [];
  });
}

describe("rate limits are shared across instances", () => {
  it("every checkRateLimit in a route is shared:true unless it is on the cheap-endpoint list", () => {
    const offenders: string[] = [];
    for (const f of routeFiles(API_DIR)) {
      const s = fs.readFileSync(f, "utf8");
      for (const m of s.matchAll(/checkRateLimit\(\s*req,\s*\{([\s\S]*?)\}\s*\)/g)) {
        const body = m[1];
        if (/shared\s*:\s*true/.test(body)) continue;
        const prefix = body.match(/keyPrefix:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? "?";
        if (!MEMORY_ONLY_OK.has(prefix)) offenders.push(`${path.relative(API_DIR, f)} (${prefix})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
