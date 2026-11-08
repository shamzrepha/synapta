# Sunroot design system: "workbench"

Goal: look like a serious learning tool (Tinkercad, AutoCAD, Linear, Notion), not a shop window or a generated template.

## Principles
1. **Flat.** Surfaces are separated by hairline borders. No gradients, glow, blur, glass, or hover scale-ups. Shadows only on things that float (menus, dialogs, toasts).
2. **Structure over decoration.** Pages use ruled sections, a clear heading and aligned grids. Group with space and rules before boxes.
3. **One accent at a time.** Colour carries meaning on a 60 / 30 / 10 balance.
4. **Two modes, equal.** Light and dark are both designed, not inverted. The saved (or device) choice is applied before first paint.
5. **Line icons, never emoji.** Feature tiles use `FeatureIcon`.

## Colour (tokens in `app/globals.css`)
| Role | Scale | Light | Dark | Used for |
|---|---|---|---|---|
| Surface (60%) | `slate` graphite | `#F7F8FA` page, `#FFFFFF` card, `#E1E5EA` hairline | `#0E1116` page, `#161A21` card, `#262C36` hairline | everything you work on |
| Action and growth (30%) | `teal` Root green | `#1F6E45` buttons, `#195A39` hover | `#2A8755` buttons, `#78BC93` text | primary buttons, links, active nav, progress |
| Energy (10%) | `amber` Sun orange | `#E8841A` | `#F29B2E` | streak, XP, highlights, warnings |
| Status | | green `#1F8F4E` mastered, orange `#E8841A` learning, red `#D92D20` needs work | `#47C17F`, `#F29B2E`, `#F97066` | mastery, errors, success |

Text on `teal-600` and `teal-500` is white (contrast 4.6:1 or better).

## Type
IBM Plex Sans (400, 500, 600, 700) for everything, IBM Plex Mono for numbers, labels and codes. Headings are 600 weight with slightly tight tracking. Small labels use mono, uppercase, wide tracking.

## Shape and motion
- Radius: 8px controls and cards (`rounded-lg` and `rounded-xl` map to 8px), 10 to 12px for larger panels, pills for chips only.
- Spacing on a 4px/8px grid; sections breathe (`py-16` to `py-24` on the landing page).
- One easing for every transition: `cubic-bezier(0.16, 1, 0.3, 1)`. Respect `prefers-reduced-motion`.

## Structure
- App: left sidebar (icon rail on tablets), compact top bar, phone bottom bar with five items, max content width 1200px.
- Landing page: header, hero with a real product window, three-step "how it works", ruled feature list, phone screenshots, teacher section, languages, Android download, closing call to action. No invented numbers, customers or company claims.

## Not done yet
- The screenshots on the landing page (`public/landing/*.jpg`) were taken with the previous look; retake them with the new one.
- Individual screens still hold old spacing habits (nested cards, heavy padding). Review per screen.
