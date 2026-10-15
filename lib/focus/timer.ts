/**
 * Synchronised Pomodoro maths. The room stores `anchorMs` (server time the host pressed start);
 * every client derives the phase from (serverNow - anchorMs), so everyone sees the same clock.
 */
export interface TimerConfig {
  focusMin: number;
  breakMin: number;
}

export interface TimerState {
  phase: "focus" | "break";
  /** zero-based index of the current focus/break cycle (= the focus block number) */
  block: number;
  remainingMs: number;
  totalMs: number;
}

export const LIMITS = { focusMin: [5, 90], breakMin: [1, 30] } as const;

export function clampConfig(c: Partial<TimerConfig>): TimerConfig {
  const clamp = (v: unknown, [lo, hi]: readonly [number, number], dflt: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : dflt;
    return Math.min(hi, Math.max(lo, n));
  };
  return { focusMin: clamp(c.focusMin, LIMITS.focusMin, 25), breakMin: clamp(c.breakMin, LIMITS.breakMin, 5) };
}

export function timerAt(anchorMs: number, cfg: TimerConfig, nowMs: number): TimerState {
  const focusMs = cfg.focusMin * 60_000;
  const cycleMs = focusMs + cfg.breakMin * 60_000;
  const elapsed = Math.max(0, nowMs - anchorMs);
  const block = Math.floor(elapsed / cycleMs);
  const within = elapsed - block * cycleMs;
  if (within < focusMs) return { phase: "focus", block, remainingMs: focusMs - within, totalMs: focusMs };
  return { phase: "break", block, remainingMs: cycleMs - within, totalMs: cfg.breakMin * 60_000 };
}

export function blockStartMs(anchorMs: number, cfg: TimerConfig, block: number): number {
  return anchorMs + block * (cfg.focusMin + cfg.breakMin) * 60_000;
}

/** Server time at which focus block `block` ends. */
export function blockEndMs(anchorMs: number, cfg: TimerConfig, block: number): number {
  return blockStartMs(anchorMs, cfg, block) + cfg.focusMin * 60_000;
}

export interface ClaimCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Can this member claim credit for focus block `block`? The block must be over (small tolerance),
 * not absurdly old, and the member must have joined the room before (or right at) its start and not left since (honour system:
 * phones suspend background tabs, so we don't require heartbeats through the block).
 */
export function canClaimBlock(args: {
  anchorMs: number;
  cfg: TimerConfig;
  block: number;
  nowMs: number;
  joinedAtMs: number;
}): ClaimCheck {
  const { anchorMs, cfg, block, nowMs, joinedAtMs } = args;
  if (!Number.isInteger(block) || block < 0) return { ok: false, reason: "Invalid block" };
  const start = blockStartMs(anchorMs, cfg, block);
  const end = blockEndMs(anchorMs, cfg, block);
  if (nowMs < end - 3000) return { ok: false, reason: "Block isn't finished yet" };
  if (nowMs > end + 6 * 3600_000) return { ok: false, reason: "Block is too old" };
  if (joinedAtMs > start + 60_000) return { ok: false, reason: "You joined after this block started" };
  return { ok: true };
}

export function xpForBlock(focusMin: number): number {
  return Math.min(50, Math.max(5, Math.round(focusMin)));
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode(rand: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join("");
}
export function normalizeCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{6}$/.test(c) ? c : null;
}

/** A member counts as present if their heartbeat is recent. */
export const PRESENCE_MS = 90_000;
