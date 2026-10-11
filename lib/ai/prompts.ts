/**
 * Audience Adaptation & Pedagogical Prompt Construction.
 * Evidence-based adaptations driven by accessibility preferences,
 * measured BKT mastery, and learner goals.
 */

export interface AudienceAdaptationOptions {
  profileTags?: string[];
  classAudienceTags?: string[];
  masteryProbability?: number; // pL from BKT (0.0 to 1.0)
  activeQuizAnswer?: string; // Used by answer-leak guard
}

const COMMON_IDIOMS = [
  /\bpiece of cake\b/i,
  /\bbite the bullet\b/i,
  /\bbreak a leg\b/i,
  /\bhit the nail on the head\b/i,
  /\brule of thumb\b/i,
  /\bunder the weather\b/i,
  /\bburning the midnight oil\b/i,
  /\bballs in your court\b/i,
  /\bbarking up the wrong tree\b/i,
  /\bspill the beans\b/i,
];

/**
 * Validates that an output is strictly literal, flagging idioms or sarcastic figures of speech.
 */
export function checkLiteralness(text: string): { isLiteral: boolean; offendingIdiom?: string } {
  for (const regex of COMMON_IDIOMS) {
    const match = text.match(regex);
    if (match) {
      return { isLiteral: false, offendingIdiom: match[0] };
    }
  }
  return { isLiteral: true };
}

/**
 * Server-side guard preventing tutor from leaking answers to active quiz/assessment questions.
 */
export function containsAnswerLeak(tutorReply: string, storedAnswer: string): boolean {
  if (!storedAnswer || storedAnswer.trim().length < 2) return false;

  const normalizedReply = tutorReply.toLowerCase().trim();
  const normalizedAnswer = storedAnswer.toLowerCase().trim();

  // Direct exact inclusion
  if (normalizedReply.includes(normalizedAnswer)) {
    return true;
  }

  // Common reveal phrases: "the answer is X", "correct answer is X"
  const revealRegex = new RegExp(`(?:the\\s+answer\\s+is|correct\\s+answer\\s+is)\\s+[:"']*${escapeRegExp(normalizedAnswer)}`, "i");
  if (revealRegex.test(normalizedReply)) {
    return true;
  }

  return false;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generates audience adaptation prompt augmentations.
 */
export function getAudienceSystemPrompt(options: AudienceAdaptationOptions): string {
  const tags = new Set([...(options.profileTags || []), ...(options.classAudienceTags || [])]);
  const prompts: string[] = [];

  // 1. ADHD-friendly / Dopamine-Step mode
  if (tags.has("adhd_friendly") || tags.has("micro_steps") || tags.has("dopamine_step")) {
    prompts.push(
      `[MODE: MICRO-STEPS / HIGH VELOCITY]
- Decompose all concepts and tasks into concrete 2-minute micro-steps.
- Provide immediate affirmative feedback on each small step before introducing the next.
- Keep sentences concise and actionable. Avoid long walls of continuous text.`
    );
  }

  // 2. Autism-friendly / Literal mode
  if (tags.has("literal_mode") || tags.has("autism_friendly") || tags.has("low_arousal")) {
    prompts.push(
      `[MODE: STRICT LITERAL / NO IDIOMS]
- Absolutely NO metaphors, idioms, irony, sarcasm, or ambiguous rhetorical questions.
- State all concepts in explicit, factual, structural terms.
- Use explicit step-by-step numbering and unambiguous definitions.`
    );
  }

  // 3. Engineer / Adversary mode (when mastery is high or tagged)
  const isHighMastery = (options.masteryProbability ?? 0) >= 0.85;
  if (tags.has("engineering_rigor") || tags.has("adversary_mode") || isHighMastery) {
    prompts.push(
      `[MODE: SENIOR REVIEWER / ADVERSARY]
- Treat the student as a technical peer. Critique their logic with industrial rigor.
- Probe edge cases, architectural trade-offs, and failure modes.
- If appropriate, challenge them to diagnose subtle system faults or boundary-condition flaws.`
    );
  }

  // 4. Kids / Teach-the-Bot mode
  if (tags.has("kids") || tags.has("teach_the_bot")) {
    prompts.push(
      `[MODE: TEACH-THE-BOT]
- Adopt the persona of a friendly, inquisitive learning robot that needs the student to explain the concept.
- Ask questions that prompt the student to formulate definitions in their own words.
- Validate their reasoning with enthusiastic encouragement.`
    );
  }

  // 5. Socratic hint ladder requirement
  prompts.push(
    `[SOCRATIC TUTOR HARNESS]
- When the student is stuck, strictly follow the 3-tier hint ladder:
  1. Nudge: Point attention to the relevant principle without giving formulas.
  2. Partial: Provide the structural setup or first operation.
  3. Worked Step: Demonstrate how the immediate step is solved.
- NEVER reveal the final answer to any active assessment item directly.`
  );

  return prompts.join("\n\n");
}
