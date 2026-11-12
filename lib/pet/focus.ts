/**
 * Focus sprints with Sprout: a short timer to read or practise without drifting, then a short break. Pure functions
 * (the caller passes the clock) so the timing can be tested and nothing here touches the page.
 */
export type FocusPhase = "idle" | "focus" | "break";

export interface FocusState {
  phase: FocusPhase;
  startedAt: number;
  endsAt: number;
  /** the halfway cheer was already given */
  halfDone: boolean;
}

export type FocusEvent = "none" | "halfway" | "focus-done" | "break-done";

export const IDLE: FocusState = { phase: "idle", startedAt: 0, endsAt: 0, halfDone: false };

/** A longer sprint earns a longer break. */
export function breakMinutes(sprintMinutes: number): number {
  return sprintMinutes >= 20 ? 5 : 2;
}

export function startFocus(now: number, minutes: number): FocusState {
  const m = Math.min(60, Math.max(1, Math.round(minutes)));
  return { phase: "focus", startedAt: now, endsAt: now + m * 60_000, halfDone: false };
}

/** Advances the timer to `now` and says what happened, if anything. Call it about once a second. */
export function tick(state: FocusState, now: number): { state: FocusState; event: FocusEvent } {
  if (state.phase === "focus") {
    if (now >= state.endsAt) {
      const sprint = (state.endsAt - state.startedAt) / 60_000;
      return { state: { phase: "break", startedAt: now, endsAt: now + breakMinutes(sprint) * 60_000, halfDone: true }, event: "focus-done" };
    }
    if (!state.halfDone && now >= state.startedAt + (state.endsAt - state.startedAt) / 2) {
      return { state: { ...state, halfDone: true }, event: "halfway" };
    }
  }
  if (state.phase === "break" && now >= state.endsAt) return { state: IDLE, event: "break-done" };
  return { state, event: "none" };
}

export function remainingMs(state: FocusState, now: number): number {
  return state.phase === "idle" ? 0 : Math.max(0, state.endsAt - now);
}

/** 9:05 style clock for the little timer chip. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
