/**
 * The short rulebook every model reads before writing a simulation, written so a small or fast model (for example a
 * Groq-hosted one) can follow it without guessing. The long version for people lives in docs/design/SIM-DESIGN-GUIDE.md;
 * keep the two in step.
 */
export const SIM_MODEL_GUIDE = `HOW TO BUILD IT (follow in this order; the reference example below already does all of it):
1. Choose ONE idea the learner can change and see: one or two variables, one clear cause and effect, one goal.
2. Physical or spatial topic: build a 3D scene with SimKit3D (see 1b). Abstract topic: <canvas> or SVG, still with a goal.
3. Write the layout first: goal banner, stage, controls with value and unit, live readouts with the formula, Pause and Reset, "What to notice".
4. Then the model: real equations, SI units, a fixed small time step inside kit.onFrame(dt).
5. Then the game: a target the learner reaches by changing the variables, stars or a score, then window.sunroot.complete({score, level}).
6. Then the tutor: window.sunroot.say(text,{tone}) to ask a prediction first, hint after the first change, praise on success.
7. Last, read your own code once: every id you query exists, every variable is declared, the sim-meta JSON is valid.

MISTAKES TO AVOID (these are what small models get wrong):
- Writing a second requestAnimationFrame loop for the 3D scene, creating your own THREE.WebGLRenderer, camera or lights (SimKit3D already has them).
- Importing or loading anything: no import statements, no CDN, no fetch. THREE and SimKit3D are already global.
- Plain unlit boxes and wireframes. Use kit.roundedBox / kit.cylinder / kit.sphere with a metalness or roughness option so parts look real.
- Sliders only. Also let the learner act in the scene (drag handle, tap, hold) with pointer events, never mouse-only events.
- Hard-coded pixel sizes. Size from the container (CSS vh, ResizeObserver), test at 360 px wide.
- A goal that cannot be reached, or complete() called every frame. Call it once per level and guard with a flag.
- Text the learner cannot read: keep 14 px or larger, high contrast, units on every number.
- A checkQuestion with the answer written differently from the option text, or more or fewer than 4 options.
- Markdown fences, comments before <!DOCTYPE html>, or explanations after </html>. Output the document only.`;
