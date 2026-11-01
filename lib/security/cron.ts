import { timingSafeEqual } from "crypto";

/** Scheduled jobs prove themselves with `Authorization: Bearer $CRON_SECRET`; no secret configured means no access. */
export function isCronAuthorized(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !authorization) return false;
  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
