import { FormatCountersSchema, HALF_LIFE_DAYS, MAX_TOPICS, type FormatCounters, type MirrorState, type Signal } from "./schema";

const DAY_MS = 86_400_000;

/** Multiplier for `elapsedMs` of ageing: 0.5 after one half-life. */
export function decayFactor(elapsedMs: number, halfLifeDays = HALF_LIFE_DAYS): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  return Math.pow(0.5, elapsedMs / (halfLifeDays * DAY_MS));
}

function decayCounters(c: FormatCounters, k: number): FormatCounters {
  return {
    starts: c.starts * k,
    finishes: c.finishes * k,
    skips: c.skips * k,
    tooHard: c.tooHard * k,
    tooEasy: c.tooEasy * k,
    hints: c.hints * k,
    retries: c.retries * k,
    dwellRatioSum: c.dwellRatioSum * k,
    dwellN: c.dwellN * k,
  };
}

/** Ages every counter up to `nowMs`. Pure. */
export function decayState(state: MirrorState, nowMs: number): MirrorState {
  if (!state.asOf) return { ...state, asOf: nowMs };
  if (nowMs <= state.asOf) return state;
  const k = decayFactor(nowMs - state.asOf);
  const formats: MirrorState["formats"] = {};
  for (const [f, c] of Object.entries(state.formats)) if (c) formats[f as keyof typeof formats] = decayCounters(c, k);
  const topics: MirrorState["topics"] = {};
  for (const [id, t] of Object.entries(state.topics)) if (t.w * k > 0.05) topics[id] = { title: t.title, w: t.w * k };
  return {
    ...state,
    asOf: nowMs,
    formats,
    hours: state.hours.map((h) => h * k),
    sessionSum: state.sessionSum * k,
    sessionN: state.sessionN * k,
    confSum: state.confSum * k,
    confN: state.confN * k,
    topics,
  };
}

function clean(s: string): string {
  return s.replace(/[<>[\]{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Folds a batch of signals into the state: decay first, then add. Pure and cheap, no I/O and no AI.
 * When personalisation is off the state is returned untouched (nothing is collected).
 */
export function applySignals(state: MirrorState, signals: readonly Signal[], nowMs: number): MirrorState {
  if (!state.personalise) return state;
  const base = decayState(state, nowMs);
  const formats = { ...base.formats };
  const hours = base.hours.slice();
  const topics = { ...base.topics };
  let { sessionSum, sessionN, confSum, confN } = base;

  for (const s of signals) {
    const c = { ...(formats[s.format] ?? FormatCountersSchema.parse({})) };
    switch (s.kind) {
      case "start":
        c.starts += 1;
        break;
      case "finish":
        c.finishes += 1;
        if (s.dwellMs && s.expectedMs) {
          // capped so one abandoned tab cannot make someone look "deep"
          c.dwellRatioSum += Math.min(3, s.dwellMs / s.expectedMs);
          c.dwellN += 1;
        }
        if (typeof s.hour === "number") hours[s.hour] += 1;
        if (typeof s.sessionMinutes === "number") {
          sessionSum += s.sessionMinutes;
          sessionN += 1;
        }
        if (s.topicId) {
          const prev = topics[s.topicId];
          topics[s.topicId] = { title: clean(s.topicTitle || prev?.title || s.topicId), w: (prev?.w ?? 0) + 1 };
        }
        break;
      case "skip":
        c.skips += 1;
        break;
      case "too_hard":
        c.tooHard += 1;
        break;
      case "too_easy":
        c.tooEasy += 1;
        break;
      case "hint":
        c.hints += Math.max(1, s.hints ?? 1);
        break;
      case "retry":
        c.retries += 1;
        break;
      case "confidence":
        if (s.confidence) {
          confSum += s.confidence;
          confN += 1;
        }
        break;
    }
    formats[s.format] = c;
  }

  // keep the interest list bounded: drop the weakest
  const ids = Object.keys(topics);
  if (ids.length > MAX_TOPICS) {
    ids.sort((a, b) => topics[b].w - topics[a].w);
    for (const id of ids.slice(MAX_TOPICS)) delete topics[id];
  }
  return { ...base, formats, hours, topics, sessionSum, sessionN, confSum, confN, totalSignals: base.totalSignals + signals.length };
}
