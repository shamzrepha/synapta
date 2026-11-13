# How to design a SunrootLearn simulation (for people and for any AI model)

Goal: a learner changes something, sees the result at once, and wins a small challenge. The same page works on a phone, with any model that writes the code (Gemini, Groq, Claude, anything), because the structure is fixed and proven.

## 1. What the platform gives the model for free
- `THREE` (three.js) and `SimKit3D` are already loaded in the sandbox. Never import or fetch anything.
- `SimKit3D.create(div)` gives a studio scene: soft lighting and shadows, a grid floor, drag to orbit, pinch or wheel to zoom.
- Parts: `kit.roundedBox(w,h,d,color,radius?,opts?)`, `kit.box`, `kit.cylinder(r,h,color,opts?)`, `kit.sphere(r,color,opts?)`, `kit.tube([[x,y,z],...],radius,color)`. `opts` = `{ metalness, roughness, emissive, emissiveIntensity, opacity }`.
- `kit.lookAt(x,y,z,distance)` frames the scene. `kit.onFrame((dt,t)=>{...})` runs every frame. `kit.scene`, `kit.THREE`, `kit.camera` exist for advanced use (groups, rotation).
- Bridge to the app: `window.sunroot.say(text,{tone})` (tutor speaks; tones `ask`, `hint`, `praise`, `warn`), `window.sunroot.complete({score,level})` (goal reached), `window.sunroot.progress(...)`, `window.sunroot.award({stars,xp,label})`.
- The host adds a strict content policy: no network, no storage, no popups.

## 2. The five parts every simulation has
1. **Goal banner**: one sentence the learner can fail or pass ("Make one swing take 2.0 s").
2. **Stage**: the 3D scene (physical topics) or canvas/SVG (abstract topics), sized from its container.
3. **Controls**: a slider per variable with its value and unit, plus something to grab inside the scene (a handle, a tap, a hold).
4. **Readouts**: live numbers with units and the governing formula as text (`T = 2π√(L/g)`).
5. **Feedback loop**: the tutor asks a prediction first, hints after the first change, praises on success; the goal calls `complete()` once.

Plus Pause/Play, Reset, and a "What to notice" line that names the cause and effect.

## 3. Design rules that make it feel premium
- One idea per simulation. One or two variables, not six.
- Real physics, real units, a small fixed time step. Never fake the numbers.
- Parts look like the thing: rounded edges, metal or plastic feel, colour used to explain (the thing you change is blue, the result is gold). No wireframes, no flat unlit boxes.
- Phone first: it must work at 360 px wide, touch targets at least 44 px, text at least 14 px, nothing wider than the screen.
- Motion explains: show the cause moving before the effect (a force arrow growing, a trail behind a moving part).
- A win must be reachable, and visible: score or stars, a short celebration, then `complete()`.
- Brand: dark background `#0b0f14`, blue `#4A6CF7`, gold `#F5B83A` only for rewards, readable high contrast.

## 4. Build order (the recipe a small model should follow)
1. Choose the idea and the goal. 2. Write the HTML layout. 3. Build the scene. 4. Write the physics in `kit.onFrame`. 5. Add controls and readouts. 6. Add the goal, tutor lines and `complete()`. 7. Reread: every id exists, every variable is declared, the JSON in `sim-meta` is valid.

## 5. The reference example
`lib/sim/reference.ts` holds a complete, tested pendulum simulation. Every generation prompt includes it, so the model copies a proven structure. It is checked by `lib/sim/reference.test.ts` with the same rules the app applies to generated labs, and was run in a real browser (no console errors, the goal fires `complete()`).

## 6. What small models usually get wrong, and how the app reacts
| Mistake | What the app does |
|---|---|
| A second animation loop, own renderer, camera or lights | Quality check fails, the model is asked to try again with that exact reason |
| Scene never moves (no `kit.onFrame`) | Same |
| No way to win (`complete()` missing) or no Reset | Same |
| Sliders only, no pointer events | Same |
| Fixed pixel sizes | Same (ResizeObserver check) |
| Tutor never speaks | Same |
| Remote scripts, iframes, `@import` | Stripped by the sanitiser before storing |
| Invalid or missing `sim-meta` | The lab still saves with a default goal; the check question is skipped |

The first attempt that passes is kept. If both attempts are weak, the better one is kept so the teacher still gets a lab to edit.

## 7. Using a different or cheaper model
Open the admin model settings, choose the task **HTML5 Simulation Builder** (`sim_build`) and pick any provider (a Groq model works). Long code output needs a model with a large output limit: if labs come back cut off at the end, pick a model with a bigger limit for this task only. Check a new model like this:
1. Generate three labs on different topics (one physical, one abstract, one maths).
2. Open each on a phone-sized screen. It should load without a console error, move on its own, respond to dragging, and fire the goal.
3. If it fails the same rule twice, raise the temperature a little less (`0.4`) or move that task back to a stronger model.

## 8. Adding a better reference
Add a second example in `lib/sim/reference.ts` only if it teaches a new pattern (an abstract canvas simulation, a multi-level game). Keep the whole prompt under about 20k characters. Test every new example in a browser before committing.
