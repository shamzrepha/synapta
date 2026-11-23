import { sec } from "../theme";

/**
 * The 60-second master, re-timed to the recorded voice (the brief says to re-time scenes rather than rush the voice).
 * `at` and `len` are seconds. `vo` is the voiceover file in public/vo, `caption` the words shown as subtitles.
 * Voice is Nigerian English (en-NG-EzinneNeural), generated for this draft: swap the files in public/vo for a human recording at any time.
 */
export interface SceneDef {
  /** which scene component to play (1 to 11) */
  scene: number;
  id: number;
  at: number;
  len: number;
  vo: string;
  voLen: number;
  caption: string;
}

type Row = [scene: number, len: number, vo: string, voLen: number, caption: string];

const build = (rows: Row[]): SceneDef[] => {
  let t = 0;
  return rows.map((r, i) => {
    const s: SceneDef = { scene: r[0], id: i + 1, at: t, len: r[1], vo: `vo/${r[2]}.mp3`, voLen: r[3], caption: r[4] };
    t += r[1];
    return s;
  });
};

const durations: Record<number, number> = { 1: 3.84, 2: 5.09, 3: 2.16, 4: 5.66, 5: 5.74, 6: 4.66, 7: 4.15, 8: 4.46, 9: 3.65, 10: 3.94, 11: 5.69 };
const lens = [5.0, 6.0, 3.8, 6.6, 6.8, 5.8, 5.6, 5.4, 4.8, 4.2, 6.0];
const captions = [
  "First week of uni. And the notes are already doing too much.",
  "You read. You highlight. But sometimes, it still doesn't click.",
  "So bring your own material into Sunroot.",
  "A PDF, a photo, a scan. Your notes become clean, structured study notes.",
  "Ask the tutor. Change the explanation. Or read along, one word at a time.",
  "Then test what you know. Quiz it. Try it in your own words.",
  "Got one wrong? Good. Now you know what to work on.",
  "Sunroot helps you revisit it, with flashcards and a plan for what comes next.",
  "And when you're ready to build, explore virtual labs and learn with others.",
  "Your notes. Your pace. A clearer way to learn.",
  "Start free at sunrootlearn.com. Bring your notes. Let's make sense of them.",
];

/** the 60-second master */
export const PLAN_60 = build(lens.map((len, i): Row => [i + 1, len, `s${String(i + 1).padStart(2, "0")}`, durations[i + 1], captions[i]]));

/** the 30-second cutdown: the same story, re-edited (not sped up) */
export const PLAN_30 = build([
  [1, 4.6, "c30_1", 3.84, "First week of uni. And the notes are already doing too much."],
  [3, 3.4, "c30_3", 2.02, "Bring your own material into Sunroot."],
  [4, 5.0, "c30_4", 3.91, "Your PDFs and handwritten notes become clean, structured study notes."],
  [5, 5.4, "c30_5", 4.15, "Ask the tutor. Read along. Then test what you know."],
  [7, 5.4, "c30_7", 4.15, "Got one wrong? Good. Now you know what to work on."],
  [11, 6.2, "c30_11", 5.71, "Bring your notes. Let's make sense of them. Start free at sunrootlearn.com."],
]);

/** the 15-second cutdown: one promise */
export const PLAN_15 = build([
  [1, 2.2, "c15_1", 1.68, "Uni notes getting overwhelming?"],
  [4, 5.6, "c15_4", 5.04, "Bring them into Sunroot. Get clear notes, explanations and practice."],
  [10, 4.1, "c15_6", 3.67, "Understand it. Build it. Prove it."],
  [11, 3.1, "c15_11", 2.21, "Start free at sunrootlearn.com."],
]);

export const SCENES = PLAN_60;
export const PLANS = { "60": PLAN_60, "30": PLAN_30, "15": PLAN_15 } as const;
export type PlanId = keyof typeof PLANS;
export const planFrames = (id: PlanId) => sec(PLANS[id].reduce((n, s) => n + s.len, 0));
export const TOTAL_SECONDS = PLAN_60.reduce((n, s) => n + s.len, 0);
export const TOTAL_FRAMES = sec(TOTAL_SECONDS);
/** the voice starts a beat after its scene does */
export const VO_DELAY = 0.35;

/** Subtitle cues for the SRT/VTT files and the burned-in version: one cue per sentence, split by length. */
export function cues(plan: readonly SceneDef[] = PLAN_60): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  for (const s of plan) {
    const parts = s.caption.split(/(?<=[.?!])\s+/);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let cursor = s.at + VO_DELAY;
    for (const p of parts) {
      const d = (p.length / total) * s.voLen;
      out.push({ start: cursor, end: cursor + d, text: p });
      cursor += d;
    }
  }
  return out;
}
