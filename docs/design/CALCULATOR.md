# Sprout calculator

Opened from the HUD button or when a learner asks Sprout to calculate (`lib/pet/calc-intent.ts`, which can pre-fill the expression). Phones get a bottom sheet with 48px keys; desktop gets a floating card. There is no `<input>`, `<textarea>` or contenteditable, so the device keyboard never appears. A physical keyboard works while the calculator has focus.

## Layers
- `lib/calculator/model.ts`: the expression is a tree (rows of nodes; fraction, root, power, function and bracket templates own slots) with a caret path. Pure editing: insert, backspace, left/right/up/down.
- `lib/calculator/actions.ts`: key actions, the "Ans after =" rule, physical key map.
- `lib/calculator/latex.ts`: tree to LaTeX, with the caret and empty-slot boxes. Rendered by KaTeX in `components/calculator/math-display.tsx` (only `\htmlClass` is trusted, and the LaTeX is generated from the tree, never from user text).
- `lib/calculator/eval.ts`: safe recursive-descent evaluator over the tree. BigInt rationals plus `a*sqrt(n)` radicals give exact results for + - x / , integer powers, simple roots, factorial, nCr, nPr; everything else is IEEE doubles shown to 12 significant digits. S<->D toggles exact and decimal. Errors are `Syntax error`, `Math error`, `Divide by zero`.
- `lib/calculator/from-text.ts`: text such as `9.8*sin(30)` to a tree, with a fixed vocabulary; unknown words return null. `lib/pet/calc-eval.ts` wraps this for text callers.

No `eval`, no `new Function`. Limits: 400 nodes, 40 nesting levels, 1200-digit exact values (beyond that the result falls back to decimal).

## Keys
Digits neutral, operators brand blue, functions muted, equals solid brand. `2nd` swaps to inverse trig, nth root, square, 10^x, e^x, e, nCr, nPr, log base a, M-, MC, reciprocal. Every key has an `aria-label` in words. Keys live in `components/calculator/keys.ts`.

Not covered: graphing (removed with the text field), exact trig values beyond multiples of 1/2.
