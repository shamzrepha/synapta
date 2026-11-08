# Anti-slop audit (main, after the Impeccable / UI UX Pro Max pass)

Measured with searches over `app/` and `components/` (`*.tsx`, `*.css`).

| Check | Result | Verdict |
|---|---|---|
| Default Inter / system font as the visible font | None. DM Sans (body) and Space Grotesk (display) via `next/font` | Good |
| Untinted pure greys (`#888`, `#444`, `text-gray-*`, `border-gray-*`, `bg-gray-*`) | 0 | Good. Colour scales are remapped to the brand in `globals.css` |
| Headings | Display face, `-0.025em` tracking, `text-wrap: balance` | Good |
| Layered shadows, hairline borders | `shadow-soft`, `shadow-elevated` defined | Good |
| Focus ring and reduced motion | Global `:focus-visible` ring; global `prefers-reduced-motion` rule | Good |
| Bounce / elastic easing | 6 `animate-bounce` uses (typing dots in messages and topic chat) | **Fixed**: soft fade-and-rise `.typing-dot` |
| Easing | Every transition used the browser default | **Fixed**: `--default-transition-timing-function` set to `cubic-bezier(0.16, 1, 0.3, 1)` once in the theme, so all 117 `transition-all` and every other Tailwind transition use it |
| Card-in-card nesting | 3 files nest a `<Card>` inside a `<Card>` | Open, low priority: review those 3 screens |
| Bordered rounded containers | about 390 uses of border + `rounded-xl/2xl/3xl` | Open: the biggest remaining "boxed everything" feel; group with whitespace and a surface shift on busy screens first (dashboard, classes, study hub) |
| `transition-all` on large layouts | 117 | Open, low: prefer `transition-colors/shadow/transform` where a layout animates |
| Tight padding (`p-2`/`p-3`) | about 276 | Open: check on cards that hold paragraphs; small chips and icon buttons are fine |
| Reduced motion handled outside the global rule | 1 file | Fine: the global rule covers it |

## Not done on purpose
- No whole-app rewrite: this pass was already done by the previous design commits, and a second rewrite without visual review would risk the layout fixes made for phones.
- No new packages were installed from the internet. The skill packs already in `.agent/skills/` were used as reference only.
- Visual changes to individual screens should be reviewed in a browser at 360, 390, 768 and 1280 px before merging.
