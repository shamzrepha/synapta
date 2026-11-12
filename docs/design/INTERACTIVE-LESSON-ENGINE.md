# Interactive lesson engine: spec (not built yet)

The owner's target for how visual and interactive each class should be: every concept is a short, self-playing "smart board" lesson of
a few steps, each step showing exactly one change, with a plain-language line of narration, driven by a small JSON payload instead of
video. The reference is the owner's slide deck "The Blueprint to Silicon: Computer Organization & Architecture" and the mind map of the
same course.

## Shape of a lesson

1. A hierarchy (macro to micro): 3 to 7 modules, each with 2 to 4 atomic concepts, as a tree that also draws the class mind map.
2. Every concept opens with a real-world analogy (blueprint vs factory floor; doorbell vs motion sensor; bookshelf compartments).
3. A "stage" (SVG, viewBox 800x450, 40px padding) of labelled elements with ids.
4. `steps[]`: one operation per step. Each has narration (at most 35 words), a short action badge, a duration, and `transitions[]`
   (`translate`, `highlight_pulse`, `morph_text`, `draw_path`, `fade_in`, `cross_out`) on element ids with from/to state.
5. Optional checkpoint before the next step (a mini question).
6. A synthesis card: one takeaway and a pros/cons/trade-off table when two mechanisms are compared (paging vs segmentation, fixed vs
   floating point).

## Visual language

Dark ink strokes (#1E293B) on a blueprint dot grid; red for control signals, blue for memory and storage, yellow for data in motion.
Computer-systems stages show CPU, ALU, registers, RAM and buses with data packets moving along bus paths while the active control
line is lit.

## JSON schema (as given by the owner)

```json
{
  "lesson_metadata": { "topic": "", "domain": "Math | Physics | ComputerScience | Biology | Engineering", "estimated_minutes": 5, "neuro_accessibility_tags": [] },
  "curriculum_dag": { "root_node": "", "branches": [{ "id": "", "title": "", "sub_nodes": [] }] },
  "interactive_modules": [{
    "module_id": "", "title": "",
    "real_world_analogy": { "metaphor_title": "", "explanation": "" },
    "stage_config": { "viewBox": "0 0 800 450", "background_style": "blueprint_grid | clean_light", "base_svg_elements": [{ "id": "", "type": "rect | circle | path | text | group", "attributes": {}, "label": "" }] },
    "animation_steps": [{ "step_number": 1, "tutor_voiceover": "", "action_badge": "", "duration_ms": 1200,
      "transitions": [{ "target_id": "", "animation_type": "translate | highlight_pulse | morph_text | draw_path | fade_in | cross_out", "from_state": {}, "to_state": {}, "easing": "easeInOutCubic", "trail_effect": true }],
      "user_checkpoint": { "has_interaction": false, "prompt": "", "options": [], "correct_index": 0 } }],
    "synthesis_card": { "key_takeaway": "", "tradeoffs_table": [{ "aspect": "", "pro": "", "con": "" }] }
  }]
}
```

## Domain rules

- Algebra: every term is its own element; transposing lifts it, slides it across the equals sign, flips its sign, settles it. Cancelling uses `cross_out`.
- Physics/engineering: axes plus vectors animated along computed paths, with force components updating each step.
- Computer science: blocks and buses with packets moving along them.
- Biology/chemistry: compartments, ions and enzymes moving step by step.

## Guardrails

At most 35 words of narration per step; every coordinate inside the viewBox with 40px padding; a supportive peer-mentor tone that says
*why* each step happens.

## What exists today that this should build on

- `components/study/kinetic-formula.tsx` and `lib/study/kinetic-parser.ts` (procedural math animation).
- `components/classes/class-mind-map.tsx` (the class tree as an interactive mind map).
- The reader (`/classes/{id}/read`) and its chapter-end loop (`docs/design/LEARNING-LOOP.md`).

## Suggested build order

1. Zod schema for the payload plus a validator that clamps coordinates to the padding rule (token-light, safe to render).
2. One generic SVG stage with step playback (Next, Replay, Auto-play), no heavy animation library needed.
3. A `lesson_visual` AI task that returns the payload for a chapter; cache it with the chapter like the key-word cards.
4. Show it as the first "page" of a chapter in the reader.
