/**
 * The learning design spec: the structure every AI-generated class, lesson and simulation must follow.
 * It is written once, here, and read by Gemini and Groq as part of each generator's instructions (see designSpec()).
 * docs/ai/LEARNING-DESIGN-SPEC.md is generated from this file (a test keeps them identical), so people and other tools can read it too.
 */
export type SpecPart = "common" | "class" | "lesson" | "simulation";

const COMMON = `AUDIENCE AND VOICE
- Write for university and postgraduate (PhD-level) learners. Be rigorous and exact. No filler, no childish tone, no emojis, no motivational padding such as "In this lesson we will".
- Give the one-sentence answer first, then the detail. Define a term once, keep symbols and units consistent, state assumptions and limits of validity.
- Never invent sources, citations or numbers. If something needs checking, say what.`;

const CLASS = `TOPIC STRUCTURE: PIECES
- A topic is a sequence of 4 to 8 PIECES (sub-topics). Each piece is ONE idea that can be stated in a single sentence, and depends only on earlier pieces.
- The learning objectives ARE the pieces: one Bloom-tagged objective per piece, in order, foundations first. The last piece integrates the earlier ones.
- Every piece must be able to carry: a short explanation with a worked example or derivation; ONE interactive experiment about that piece only; a prediction asked before the experiment; a check question after it; one common misconception with its correction.
- Choose depth for advanced learners: derivations, assumptions, edge cases and how the idea fails.`;

const LESSON = `LESSON STRUCTURE: ONE SECTION PER PIECE
- Under "Key ideas", write one ### sub-heading per learning objective (piece), in the same order. Each sub-heading states the piece's claim as a sentence, not a label.
- Inside each: intuition (2 to 3 sentences), the formal statement, what breaks it, and a one-line prediction prompt the learner can test in the simulation ("Before you run it: what happens to X if Y doubles?").
- Finish with a short synthesis that connects the pieces.`;

const SIMULATION = `SIMULATION STRUCTURE: STAGES, ONE PER PIECE
- Build the simulation as STAGES, one per learning objective, in order, with Back/Next and a visible "stage n of N" indicator. If no objectives are given, create 3 to 5 stages yourself, from foundation to integration.
- Each stage isolates ONE concept: its own 2 to 4 controls, its own live readouts with units, the governing formula for that stage as text, and a stage goal.
- Before a stage's controls unlock, show a one-sentence prediction question with answer choices; the learner commits, then experiments. After experimenting, show whether the prediction held and why.
- When a control moves, make the change visible (a ghost of the previous value or a delta readout), so cause and effect is obvious.
- The final stage lets the earlier ideas interact (integration). Call window.sunroot.complete once per stage with level = the stage number.
- DIRECT MANIPULATION, LIKE A GAME. The main scene itself must be touchable, not only sliders: drag the heat source, drag parts into place, tap targets, pull handles on graphs, swipe a dial. Use pointer events (pointerdown / pointermove / pointerup with setPointerCapture) so mouse, touch and pen all work; hit areas at least 44px; show hover and pressed states; moved objects animate and snap; a wrong drop bounces back with a reason.
- FILL THE SCREEN AND SCALE TO ANY DEVICE. The lab is ONE screen, not a scrolling page of cards: html and body are height 100% with margin 0; the stage takes all remaining space (flex: 1, min-height: 0); controls sit in a compact dock at the bottom in portrait and at the side in landscape (@media (orientation: landscape)). Size the canvas or SVG from its container with a ResizeObserver and devicePixelRatio, and compute every coordinate from the current width and height: no fixed pixel sizes for the scene, no horizontal scroll, text sized with clamp(). When the scene is larger than the screen, let the learner pinch or wheel to zoom and drag the background to pan. Test mentally at 360px wide portrait and at 900px wide landscape.
- DRAW IT PROPERLY. Parts look like the real thing (a thermistor with leads, a thermocouple junction, a heater with glow): real shapes, gradients and soft shadows, labelled parts, and no text overlapping other text or shapes. A rectangle with a caption is not a drawing.
- TUTOR-LED, NOT A SLIDE SHOW. The learner must DO something every few seconds: drag, tap, type a number, choose, build. Never a screen that only has a Next button. Treat the simulation as a personal home tutor sitting next to the learner:
  * Call window.sunroot.say(text, { tone }) (tone "ask", "hint", "praise" or "warn") for every tutor line: open by asking the prediction question, react within a second to what the learner just did ("Good: doubling the mass halved the acceleration. Why?"), give a hint after about 12 seconds of inactivity or after two wrong tries, and congratulate real progress. One or two short sentences per line, conversational, never a lecture.
  * Make it a game: a visible goal, a score, 3 stars that are earned (call window.sunroot.award({ stars: 1, xp: 10, label: "short reason" }) when one is earned), a streak of correct predictions, and an easy-to-hard ladder of 3 challenges per stage. Failing is safe: show what happened, say why, offer Try again.
  * Learners type or drag numbers to answer where possible instead of picking from a list; check the answer instantly and show the correct working.
- Every piece of text on screen is plain, human-readable text. NEVER show LaTeX, Markdown or code syntax in the interface: no backslashes, no $...$, no **bold** markers, no curly-brace or caret notation, no raw HTML entities. Write maths with real symbols and HTML: × ÷ ± ≈ ≤ ≥ ² ³ √ π Δ θ μ Ω, <sup> and <sub> (for example v = d ÷ t, F = m × a, E = mc<sup>2</sup>, x<sub>1</sub>), and fractions as a ÷ b or a / b. The sim-meta text (title, goal, howTo, concepts, check question and options) follows the same rule.
- Everything is keyboard operable; labels at least 14px. Visual style overrides any earlier colour rule: ink background #0B0E1A, surfaces #121629, text #E7EAF5, blue #4A6CF7 for controls and selection, gold #F5B83A for goals and rewards, orange #F0795E only for "needs attention". Never use blue and orange together to mean the same thing.`;

const PARTS: Record<SpecPart, { title: string; text: string }> = {
  common: { title: "Audience and voice", text: COMMON },
  class: { title: "Class and topic structure", text: CLASS },
  lesson: { title: "Lesson structure", text: LESSON },
  simulation: { title: "Simulation structure", text: SIMULATION },
};

/** The parts of the spec a generator needs, formatted to drop into its instructions. */
export function designSpec(...parts: SpecPart[]): string {
  return `SUNROOT LEARNING DESIGN SPEC (follow this structure exactly)\n\n${parts.map((p) => PARTS[p].text).join("\n\n")}`;
}

/** The whole spec as a Markdown document (docs/ai/LEARNING-DESIGN-SPEC.md). */
export function specMarkdown(): string {
  const order: SpecPart[] = ["common", "class", "lesson", "simulation"];
  return `# Sunroot learning design spec

This is the structure every AI-generated class, lesson and simulation must follow. Gemini and Groq read it as part of each generator's instructions
(\`lib/ai/design-spec.ts\`), so any model that builds learning content for Sunroot builds it the same way. This file is generated from that code: edit the code, not this file.

Who it is for: a high-end university and PhD-level learning site. Nothing generated should look or read as basic.

${order.map((p) => `## ${PARTS[p].title}\n\n${PARTS[p].text}`).join("\n\n")}

## Where each part is used
- Class and topic structure: the class builder (\`lib/teacher/classBuilder.ts\`).
- Lesson structure: the lesson page generator (\`lib/lesson/generate.ts\`).
- Simulation structure: the simulation builder (\`lib/sim/build.ts\`).
- Audience and voice: all three.
`;
}
