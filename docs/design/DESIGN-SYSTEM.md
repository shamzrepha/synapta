# Sunroot design system: "Sun on Ink"

Goal: premium and editorial, in the spirit of Hiro and Phenomenon Studio. Near-black ink (dark) or warm paper (light), hairline borders, one saturated accent, big confident type, restrained motion.

## Principles
1. **One action colour.** Sun orange means "do this" (primary buttons, links, the active item, focus). It stays a small part of any screen so it keeps meaning.
2. **Colour carries meaning (60 / 30 / 10).** Ink or paper surfaces and text (90%), Sun orange (about 10%). Green means growth only (mastered, correct, progress). Gold means energy or caution (streaks, XP, warnings). Red means needs work or error.
3. **Hairlines, not boxes.** 1px borders and column rails structure the page. Registration marks (`+`) sit where lines cross.
4. **Editorial type.** Large, tightly tracked Instrument Sans; one emphasised word per headline in Instrument Serif italic; IBM Plex Mono, uppercase and widely tracked, for labels.
5. **Motion with purpose.** A looping product picture, a travelling light on the hero frame's border, scroll reveals, a slow subject strip, a pixel dissolve. Everything stops under `prefers-reduced-motion`.
6. **Both modes designed.** Dark is ink with a faint green undertone; light is warm paper. The saved or device choice is applied before first paint.

## Tokens (`app/globals.css`)
| Role | Scale (class name) | Light | Dark |
|---|---|---|---|
| Surface | `slate` (ink and paper) | page `#F5F3EE`, card `#FBFAF6`, hairline `#DDD9CE`, text `#121918` | page `#080C0B`, card `#0F1514`, hairline `#1F2827`, text `#ECF1EE` |
| Action | **`teal` (class name is historical; the colours are Sun orange)** | buttons `#FF7A1A` with ink text, text links `#CC5208` | buttons `#FF7A1A` with ink text, links `#FF8D3D` |
| Energy and caution | `amber` (gold) | `#E2A11B` | `#F2B632` |
| Growth | `emerald` and `--mastery-*` | mastered `#1F7A52` | mastered `#3FB27F` |

Text on an orange fill is always ink (`text-slate-950`); white on orange fails contrast. A global rule in `globals.css` enforces this for any orange fill in dark mode.

## Shape
Radius is small and crisp (controls 6px, cards 8px, panels 10 to 12px). Shadows only for floating layers. Cards in dark mode carry a 1px inner highlight.

## Motion toolkit (`components/landing`)
- `Reveal`: fade and lift on scroll. `PixelField`: canvas of fading pixels (pauses off screen, still frame under reduced motion). `HeroEngine`: CSS-only looping product picture. `.edge-sweep`: light travelling around a 1px border. `.marquee`: slow subject strip.
- Easing everywhere: `cubic-bezier(0.16, 1, 0.3, 1)`.

## Landing page structure
Header with mono nav, hero (headline, one line, one action, framed animated product window, pixel dissolve), subject strip, how it works, features grid, who it is for, teachers (class map), languages, closing call to action. The product windows are labelled "Example". No invented numbers, customers or company claims.

## Not done yet
- Individual screens still hold older spacing habits (nested cards, heavy padding); review per screen.
- `public/landing/*.jpg` screenshots are no longer used on the landing page; delete them when convenient.
