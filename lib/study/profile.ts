import { z } from "zod";

/**
 * What a topic needs. Sunroot is for any subject, so a topic on Pythagoras gets notes, an animation, practice and the
 * tutor, while a circuits topic also gets the simulation, the build lab and "Prove it". The mode is picked once (by AI,
 * or by a quick keyword check when there is no AI result yet) and the teacher can change it.
 */
export const STUDY_MODES = ["maths", "science", "memorise", "language", "code", "electronics", "practical", "general"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const NEED_KEYS = ["animation", "practice", "flashcards", "simulation", "build", "prove", "tutor"] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Needs = Record<NeedKey, boolean>;

export interface StudyProfile {
  subject: string;
  mode: StudyMode;
  needs: Needs;
  source: "ai" | "teacher" | "guess";
}

export const MODE_LABEL: Record<StudyMode, string> = {
  maths: "Maths",
  science: "Science",
  memorise: "Facts and concepts to remember",
  language: "Language",
  code: "Programming",
  electronics: "Electronics",
  practical: "Hands-on engineering",
  general: "General",
};

const on = (...keys: NeedKey[]): Needs => {
  const n = Object.fromEntries(NEED_KEYS.map((k) => [k, false])) as Needs;
  n.tutor = true;
  for (const k of keys) n[k] = true;
  return n;
};

export const MODE_NEEDS: Record<StudyMode, Needs> = {
  maths: on("animation", "practice"),
  science: on("animation", "practice", "flashcards", "simulation"),
  memorise: on("practice", "flashcards"),
  language: on("practice", "flashcards"),
  code: on("practice", "build"),
  electronics: on("animation", "practice", "flashcards", "simulation", "build", "prove"),
  practical: on("animation", "practice", "flashcards", "simulation", "build", "prove"),
  general: on("practice", "flashcards"),
};

const RULES: Array<{ mode: StudyMode; words: RegExp }> = [
  { mode: "electronics", words: /\b(circuits?|arduino|resistors?|capacitors?|transistors?|diodes?|ohm'?s|voltage|current|led|microcontrollers?|sensors?|breadboard|op-?amps?|logic gates?|electronics?)\b/i },
  { mode: "code", words: /\b(python|javascript|typescript|java|c\+\+|html|css|sql|programming|coding|algorithms?|data structures?|software|loops?|functions? in)\b/i },
  { mode: "practical", words: /\b(robot(ics|s)?|mechatronics|workshop|welding|machining|fabrication|3d print(ing)?|hydraulics|pneumatics|gearbox|engine (design|assembly|repair))\b/i },
  { mode: "maths", words: /\b(maths?|mathematics|algebra|geometry|trigonometry|calculus|pythagor\w*|theorem|equations?|fractions?|derivatives?|integrals?|matrix|matrices|vectors?|statistics|probability|logarithms?|polynomials?|quadratic|sine|cosine|angles?|triangles?|sets?)\b/i },
  { mode: "science", words: /\b(physics|chemistry|biology|forces?|motion|energy|waves?|optics|thermodynamics|reactions?|atoms?|molecules?|cells?|genetics|ecology|photosynthesis|newton|velocity|acceleration|pressure)\b/i },
  { mode: "memorise", words: /\b(history|law|legal|civic|government|economics|accounting|commerce|geography|anatomy|pharmacology|medicine|nursing|religious|biblical|marketing|constitution|contract|revolution|independence|empire|colonial|dynasty|treaty|slave trade)\b/i },
  { mode: "language", words: /\b(grammar|vocabulary|english|french|yoruba|yorùbá|igbo|hausa|spanish|arabic|swahili|essay|comprehension|literature|phonics|tenses?)\b/i },
];

/** A quick, free guess from the words in the title and description. Used until the AI has classified the topic. */
export function guessMode(text: string): StudyMode {
  const t = text || "";
  // "engine maths" is maths, not an engine workshop: maths wins over practical when both appear
  const hits = RULES.filter((r) => r.words.test(t)).map((r) => r.mode);
  if (hits.includes("maths") && hits.includes("practical")) return "maths";
  return hits[0] ?? "general";
}

export function profileFor(mode: StudyMode, subject = "", source: StudyProfile["source"] = "guess"): StudyProfile {
  return { subject: subject.slice(0, 40), mode, needs: { ...MODE_NEEDS[mode] }, source };
}

export const storedProfileSchema = z.object({
  subject: z.string().max(60).default(""),
  mode: z.enum(STUDY_MODES),
  needs: z.object(Object.fromEntries(NEED_KEYS.map((k) => [k, z.boolean()])) as Record<NeedKey, z.ZodBoolean>),
  source: z.enum(["ai", "teacher", "guess"]).default("ai"),
});

/**
 * The profile to use for a topic: the saved one, else a guess from its words. A topic where the teacher has already added
 * build labs always keeps those tabs, so nothing the teacher made disappears.
 */
export function resolveProfile(kc: { title?: string; description?: string; studyProfile?: unknown; labs?: unknown }, classSubject = ""): StudyProfile {
  const parsed = storedProfileSchema.safeParse(kc.studyProfile);
  const base = parsed.success ? (parsed.data as StudyProfile) : profileFor(guessMode(`${kc.title || ""} ${kc.description || ""} ${classSubject}`), classSubject);
  const hasLabs = Array.isArray(kc.labs) && kc.labs.some((l) => (l as { published?: boolean } | null)?.published !== false);
  if (hasLabs && !base.needs.build) return { ...base, needs: { ...base.needs, build: true, prove: base.needs.prove || base.mode === "electronics" || base.mode === "practical" } };
  return base;
}

/** One plain sentence for the teacher: what Sunroot built and why. */
export function describeProfile(p: StudyProfile): string {
  const parts = ["notes"];
  if (p.needs.animation) parts.push("an interactive lesson");
  if (p.needs.simulation) parts.push("a simulation");
  if (p.needs.practice) parts.push("practice questions");
  if (p.needs.flashcards) parts.push("flashcards");
  if (p.needs.build) parts.push("a build lab");
  if (p.needs.prove) parts.push("Prove it");
  parts.push("the AI tutor");
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Sunroot treats this as ${MODE_LABEL[p.mode].toLowerCase()} and gives students ${list}.`;
}

export const classifySchema = z.object({
  subject: z.string().max(60),
  mode: z.enum(STUDY_MODES),
});

export const CLASSIFY_SYSTEM = `You decide what kind of study a topic needs. Reply with JSON {"subject": "...", "mode": "..."}.
mode is exactly one of:
- maths: pure or applied mathematics (algebra, geometry, Pythagoras, calculus, statistics, engine or finance maths)
- science: physics, chemistry, biology, earth science: ideas that benefit from a simulation
- memorise: facts, definitions and cases to remember (history, law, accounting, anatomy, geography)
- language: learning or analysing a language, grammar, writing, literature
- code: programming and software
- electronics: circuits and microcontrollers
- practical: hands-on engineering (robotics, mechanisms, workshop skills)
- general: anything else
subject is a short label such as "Geometry" or "Contract law". Judge by what the learner must DO with the topic, not just a keyword: "engine maths" is maths, not practical.`;
