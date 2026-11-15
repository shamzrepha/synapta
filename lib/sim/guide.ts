/**
 * The short rulebook every model reads before writing a simulation, written so a small or fast model (for example a
 * Groq-hosted one) can follow it without guessing. The long version for people lives in docs/design/SIM-DESIGN-GUIDE.md;
 * keep the two in step.
 */
export const SIM_MODEL_GUIDE = `HOW TO BUILD IT (follow in this order; the reference example below already does all of it):
1. Choose ONE idea the learner can change and see: one or two variables, one clear cause and effect, one goal.
2. Choose the clearest visual medium:
   - Electrical circuits (Ohm's law, bulbs, resistors, multimeters, switches), ray optics, bench chemistry, waves/plots, and algorithms: build a RICH, REALISTIC 2D WORKBENCH (<canvas> or <svg>) with real parts (filament bulb glow, banded resistor, digital/needle multimeter, animated current flow dots).
   - True 3D spatial/mechanical engineering (linkages, trusses, 3D trajectories, orbits, 3D molecules, motors): build a COMPACT 3D scene with SimKit3D kept inside x,z in [-3.5,+3.5], y in [0,3.5], pass opts like {color, pos: [x,y,z]}, and call kit.fitCamera().
3. Write a ONE-SCREEN COCKPIT layout (never a tall scrolling page): goal bar + 2-column grid on desktop (stage on left capped at clamp(240px, 48vh, 410px), sliders/multimeter/Formula/Pause/Reset on right).
4. Then the model: real equations, SI units, a fixed small time step inside kit.onFrame(dt).
5. Then the game: a target the learner reaches by changing the variables, stars or a score, then window.sunroot.complete({score, level}).
6. Then the tutor: window.sunroot.say(text,{tone}) to ask a prediction first, hint after the first change, praise on success.
7. Last, read your own code once: every id you query exists, every variable is declared, the sim-meta JSON is valid.

REAL-WORLD RULES (a lab that only looks right is wrong):
- Decide what is "good" and "bad" from the physics, never from a script. Compute it: current, voltage, power, force, energy, temperature, concentration, whatever the topic needs, with SI units and the real equations. A learner's connection or step is good when those numbers stay in the safe or correct range, and bad when they do not.
- A wrong connection or wrong step must have the real consequence on screen: an LED with no resistor draws I = V / R far above its 20 mA limit and burns out; a short circuit makes the supply collapse; a beam loaded past its limit bends and snaps; a wrongly ordered step gives a product that does not form. Show the number that broke the rule, say why in one sentence (window.sunroot.say with tone "warn"), then let the learner undo and try again.
- Order matters when it does in real life: check each step against the one before it (power before measuring, closed loop before current flows, balanced equation before counting atoms).
- Never fake a result with a fixed animation or a hard-coded answer. If the learner changes a value, every readout and the picture follow from the model.
- Give the learner a way to see the rule: live readouts with units, a limit marker on gauges, and the formula as text beside the numbers.

MISTAKES TO AVOID (these are what small models get wrong):
- Writing a second requestAnimationFrame loop for the 3D scene, creating your own THREE.WebGLRenderer, camera or lights (SimKit3D already has them).
- Importing or loading anything: no import statements, no CDN, no fetch. THREE and SimKit3D are already global.
- Overlapping parts at [0,0,0] or wrong SimKit3D arg order (ALWAYS put { color, pos: [x,y,z], metalness, roughness } inside the trailing opts object, and call kit.fitCamera() so nothing balloons oversized).
- Sliders only. Also let the learner act in the scene (drag handle, tap, hold) with pointer events, never mouse-only events.
- Hard-coded pixel sizes. Size from the container (CSS vh, ResizeObserver), test at 360 px wide.
- A goal that cannot be reached, or complete() called every frame. Call it once per level and guard with a flag.
- Text the learner cannot read: keep 14 px or larger, high contrast, units on every number.
- A checkQuestion with the answer written differently from the option text, or more or fewer than 4 options.
- Markdown fences, comments before <!DOCTYPE html>, or explanations after </html>. Output the document only.`;
