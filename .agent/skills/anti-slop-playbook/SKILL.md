---
name: anti-slop-playbook
description: Master Agent Directive combining Impeccable, Taste Skill, and UI UX Pro Max to replace generic AI-generated frontends with bespoke, human-grade UI.
---

# Anti-Slop Master Playbook: Impeccable + Taste Skill + UI UX Pro Max

### 01. THE ANTI-SLOP AUDIT — TO AVOID (STRICTLY BANNED)
* **No Default/Overused Inter or System Typography**: Ban flat, unstyled default Inter/Arial/system font stacks lacking visual contrast or hierarchy.
* **No Untinted Pure Gray on Color**: Never place pure, lifeless grays (`#888`, `#444`) on colored or dark backgrounds. Always tint grays with the brand hue (slate with subtle teal/blue/amber undertones).
* **No Card-in-Card Nesting Overkill**: Never nest cards inside cards inside cards or trap every piece of text inside a rigid box.
* **No Generic Border-Radius or Heavy Borders**: Avoid slapping thick, opaque borders and identical default rounded corners on every container. Use hairline borders (`border-border/60` or `border-white/10`).
* **No Elastic/Bounce Easing**: Ban cheesy bounce/elastic animations and abrupt linear state changes. Always use smooth, intentional easing (`cubic-bezier(0.16, 1, 0.3, 1)` or `ease-out`).

### 02. THE CRAFT — TO ADOPT (REQUIRED IN ALL CODE)
* **Custom High-Contrast Typographic Scales**: Pair expressive display/editorial fonts (Space Grotesk, Instrument Serif) with crisp body/UI fonts (DM Sans, JetBrains Mono). Enforce deliberate tracking (`tracking-tight` on headings, `tracking-wide` on uppercase labels) and line-height (`leading-relaxed` on body copy).
* **Intentional Whitespace & 4px/8px Spatial Grids**: Enforce strict alignment, contrast, and spacing on a 4px/8px grid (`py-20` to `py-32` section padding, `gap-6` to `gap-12` layout spacing).
* **Natural Container-Less Grouping**: Use spatial proximity, typography contrast, and subtle surface shifts instead of heavy borders to group related content.
* **Tinted & Custom Monochromatic Gradients**: Tint all neutral grays and surfaces slightly toward the primary brand hue; use subtle atmospheric radial/linear gradients (`bg-radial-hero`).
* **Fine-Grained Details & Bespoke Modern Styling**: Apply subtle glassmorphism (`backdrop-blur-md bg-white/5` or `bg-card/75`), ultra-thin hairline borders (`border-white/10` or `border-black/5`), and layered ambient shadows.
* **Modern Micro-Interactions & Smooth Eased Motion**: Use smooth, intentional easing curves for hover states, focus rings, layout transitions, and interactive feedback (`hover:-translate-y-1 hover:shadow-xl transition-all duration-300`).

### 03. REFERENCE DESIGN LIBRARIES (INCORPORATED PATTERNS)
* **21st.dev**: Shaders, ambient background glows, animated badge ribbons, high-contrast metrics.
* **UIVibes**: Production-ready hero layouts, luxury card elevations, tactile button states.
* **VCI Components (Vibe Code Components)**: 3D interactive preview blocks, feature grids without box trapping.
* **WebsiteToPrompt**: Architecture extracted from top SaaS products (Linear, Tinkercad, Autodesk, Stripe).
* **Superdesign**: 12-column responsive layout, 3D interactive showcase cards, smooth motion timing.
