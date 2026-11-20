import { FORMATS, FORMAT_LABEL, MIN_EVIDENCE, type Format, type MapNode, type MirrorProfile, type MirrorState, type Trait, type TraitSource } from "./schema";
import { decayState } from "./signals";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const conf = (n: number) => clamp01(n / (n + MIN_EVIDENCE));

function hourLabel(h: number): string {
  const part = h < 5 ? "late night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  return `${part} (${String(h).padStart(2, "0")}:00)`;
}

function trait(id: string, label: string, n: number, value: number, observed: string, source?: TraitSource): Trait {
  const enough = n >= MIN_EVIDENCE;
  return {
    id,
    label,
    value: enough ? clamp01(value) : 0.5,
    confidence: r2(conf(n)),
    source: source ?? (enough ? "observed" : "not_enough_data"),
    detail: enough ? observed : "Still learning about you. A few more sessions and this will fill in.",
  };
}

/** What the model shows when personalisation is off or nothing has been seen: neutral, no claims. */
function neutralTrait(id: string, label: string): Trait {
  return { id, label, value: 0.5, confidence: 0, source: "not_enough_data", detail: "Not enough data yet." };
}

/**
 * Pure: turns the decayed signal counters plus the learner's own edits into the profile everything else reads
 * (ranker, Sprout's style, the "My learning map" page). Explicit edits always beat observed behaviour.
 * It describes study habits; it makes no claim about personality or ability.
 */
export function buildMirrorProfile(raw: MirrorState, nowMs: number): MirrorProfile {
  if (!raw.personalise) return neutralProfile();
  const state = decayState(raw, nowMs);
  const prefs = state.prefs;

  // formats ----------------------------------------------------------------
  const formats: MirrorProfile["formats"] = {};
  const formatNodes: MapNode[] = [];
  let totalAttempts = 0;
  let totalFinishes = 0;
  let totalStarts = 0;
  let totalHints = 0;
  let totalRetries = 0;
  let dwellSum = 0;
  let dwellN = 0;
  for (const f of FORMATS) {
    const c = state.formats[f];
    const attempts = c ? c.starts + c.skips : 0;
    const forced = prefs.formats[f];
    if (c) {
      totalAttempts += attempts;
      totalFinishes += c.finishes;
      totalStarts += c.starts;
      totalHints += c.hints;
      totalRetries += c.retries;
      dwellSum += c.dwellRatioSum;
      dwellN += c.dwellN;
    }
    const enough = attempts >= MIN_EVIDENCE;
    const observed = c ? clamp01((c.finishes + 1) / (attempts + 2) - (0.5 * c.tooHard) / (attempts + 2)) : 0.5;
    if (forced) {
      formats[f] = { affinity: forced === "more" ? 0.9 : 0.1, confidence: 1, source: "you_set" };
    } else {
      formats[f] = { affinity: enough ? r2(observed) : 0.5, confidence: r2(conf(attempts)), source: enough ? "observed" : "not_enough_data" };
    }
    formatNodes.push({
      id: `format:${f}`,
      label: FORMAT_LABEL[f],
      detail: forced
        ? forced === "more" ? "You asked for more of this." : "You asked for less of this."
        : enough ? `You finish about ${Math.round(observed * 100)}% of the ${FORMAT_LABEL[f].toLowerCase()} you open.` : "Still learning about you.",
      confidence: formats[f].confidence,
      source: formats[f].source,
    });
  }

  // pace ---------------------------------------------------------------------
  const ratio = dwellN > 0 ? dwellSum / dwellN : 1;
  const paceEnough = dwellN >= MIN_EVIDENCE;
  const observedPace: "quick" | "steady" | "deep" = ratio < 0.75 ? "quick" : ratio > 1.3 ? "deep" : "steady";
  const pace: MirrorProfile["pace"] = prefs.pace
    ? { value: prefs.pace, confidence: 1, source: "you_set" }
    : { value: paceEnough ? observedPace : "steady", confidence: r2(conf(dwellN)), source: paceEnough ? "observed" : "not_enough_data" };

  // habits ----------------------------------------------------------------------
  const persistence = trait(
    "persistence",
    "Finishing what you start",
    totalAttempts,
    (totalFinishes + 1) / (totalAttempts + 2),
    `You finish about ${Math.round(((totalFinishes + 1) / (totalAttempts + 2)) * 100)}% of the things you open${totalRetries >= 3 ? " and you often try again" : ""}.`,
  );
  const helpSeeking = trait("help", "Using hints", totalStarts, totalHints / Math.max(1, totalStarts) / 2, totalHints / Math.max(1, totalStarts) > 0.5 ? "You often use hints, which is a good way to learn." : "You mostly work things out before using a hint.");
  const confValue = state.confN > 0 ? (state.confSum / state.confN - 1) / 4 : 0.5;
  const confidence = trait("confidence", "How sure you feel", state.confN, confValue, confValue < 0.4 ? "You often rate yourself as unsure, so Sprout will cheer you on more." : confValue > 0.75 ? "You usually feel sure of your answers." : "You feel moderately sure of your answers.");

  // time of day ----------------------------------------------------------------------
  const hourTotal = state.hours.reduce((a, b) => a + b, 0);
  const bestHours =
    hourTotal >= MIN_EVIDENCE
      ? state.hours.map((w, h) => ({ w, h })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w || a.h - b.h).slice(0, 3).map((x) => x.h).sort((a, b) => a - b)
      : [];
  const sessionMinutes = state.sessionN >= 3 ? Math.round(state.sessionSum / state.sessionN) : null;

  // interests (only things the learner finished or told us) --------------------------
  const seen = new Set<string>();
  const interests: MirrorProfile["interests"] = [];
  for (const label of prefs.interests) {
    const k = label.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      interests.push({ label, weight: 1, source: "you_set" });
    }
  }
  const maxW = Math.max(1, ...Object.values(state.topics).map((t) => t.w));
  for (const t of Object.values(state.topics).filter((t) => t.w >= 2).sort((a, b) => b.w - a.w || a.title.localeCompare(b.title)).slice(0, 5)) {
    const k = t.title.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      interests.push({ label: t.title, weight: r2(t.w / maxW), source: "observed" });
    }
  }

  // voice -------------------------------------------------------------------------------
  const examples = prefs.examples ?? (pace.value === "deep" ? "long" : "short");
  const encouragement =
    prefs.encouragement ??
    (confidence.source === "observed" && confidence.value < 0.4 ? "high" : confidence.source === "observed" && confidence.value > 0.75 ? "low" : "medium");

  const evidence = Math.round(totalAttempts + state.confN);
  const tree = buildTree({ formatNodes, pace, persistence, confidence, helpSeeking, bestHours, sessionMinutes, interests });
  return { personalised: true, evidence, formats, pace, persistence, confidence, helpSeeking, bestHours, sessionMinutes, interests, examples, encouragement, tree };
}

function buildTree(p: {
  formatNodes: MapNode[];
  pace: MirrorProfile["pace"];
  persistence: Trait;
  confidence: Trait;
  helpSeeking: Trait;
  bestHours: number[];
  sessionMinutes: number | null;
  interests: MirrorProfile["interests"];
}): MapNode {
  const paceWords = { quick: "You move quickly.", steady: "You keep a steady pace.", deep: "You take your time on each one." } as const;
  const timeKnown = p.bestHours.length > 0;
  return {
    id: "root",
    label: "How you study",
    confidence: 1,
    source: "observed",
    children: [
      { id: "formats", label: "What you like to use", confidence: 1, source: "observed", children: p.formatNodes },
      {
        id: "pace",
        label: "Your pace",
        detail: p.pace.source === "not_enough_data" ? "Still learning about you." : paceWords[p.pace.value],
        confidence: p.pace.confidence,
        source: p.pace.source,
      },
      {
        id: "when",
        label: "When you study",
        detail: timeKnown ? `Mostly ${p.bestHours.map(hourLabel).join(", ")}${p.sessionMinutes ? `, about ${p.sessionMinutes} minutes at a time` : ""}.` : "Still learning about you.",
        confidence: timeKnown ? 0.6 : 0,
        source: timeKnown ? "observed" : "not_enough_data",
      },
      {
        id: "habits",
        label: "Study habits",
        confidence: 1,
        source: "observed",
        children: [p.persistence, p.confidence, p.helpSeeking].map((t) => ({ id: `trait:${t.id}`, label: t.label, detail: t.detail, confidence: t.confidence, source: t.source })),
      },
      {
        id: "interests",
        label: "Topics you enjoy",
        confidence: 1,
        source: "observed",
        children: p.interests.length
          ? p.interests.map((i) => ({ id: `interest:${i.label.toLowerCase()}`, label: i.label, detail: i.source === "you_set" ? "You told us." : "You finish a lot of this.", confidence: i.source === "you_set" ? 1 : r2(0.4 + 0.5 * i.weight), source: i.source }))
          : [{ id: "interest:none", label: "Nothing yet", detail: "Topics you finish often will show up here. You can add your own.", confidence: 0, source: "not_enough_data" }],
      },
    ],
  };
}

/** Personalisation off (or a brand new learner): no claims, every format neutral. */
export function neutralProfile(): MirrorProfile {
  const formats: MirrorProfile["formats"] = {};
  for (const f of FORMATS) formats[f as Format] = { affinity: 0.5, confidence: 0, source: "not_enough_data" };
  return {
    personalised: false,
    evidence: 0,
    formats,
    pace: { value: "steady", confidence: 0, source: "not_enough_data" },
    persistence: neutralTrait("persistence", "Finishing what you start"),
    confidence: neutralTrait("confidence", "How sure you feel"),
    helpSeeking: neutralTrait("help", "Using hints"),
    bestHours: [],
    sessionMinutes: null,
    interests: [],
    examples: "short",
    encouragement: "medium",
    tree: { id: "root", label: "How you study", detail: "Personalisation is off, so nothing is being learned about you.", confidence: 0, source: "not_enough_data", children: [] },
  };
}
