/**
 * Where Sprout waits and where its menu opens, worked out from what is actually on screen, so floating things never sit on
 * top of each other (the bottom menu, the read-aloud bar, Sprout, its menu). Pure functions so they can be tested.
 */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Sprout's resting place: the bottom-right corner, standing above any bar fixed to the bottom of the screen
 * (the phone menu, the read-aloud player) that covers its column.
 */
export function homeFor(vw: number, vh: number, w: number, h: number, docks: Box[]): { x: number; y: number } {
  const narrow = vw < 768;
  const x = vw - w - (narrow ? 12 : 8);
  let feet = vh - (narrow ? 12 : 24);
  // a bar can sit on top of another one (the player above the menu): lift above each that is in the way, tallest last
  const bottomDocks = docks.filter((d) => d.top > vh * 0.45 && d.right > x && d.left < x + w).sort((a, b) => b.top - a.top);
  for (const d of bottomDocks) if (d.top - 8 < feet && d.bottom > feet - h) feet = Math.min(feet, d.top - 8);
  return { x, y: Math.max(6, feet - h) };
}

export interface HudPlacement {
  right: number;
  bottom: number;
  width: number;
  maxHeight: number;
}

/**
 * The Jarvis menu opens right above Sprout, lined up with it. With no room above (a phone on its side) it opens beside
 * Sprout instead. Its height is capped to the room it has and it scrolls inside, so it never runs off the screen.
 */
export function hudPlacement(bot: Box, vw: number, vh: number, docks: Box[] = []): HudPlacement {
  const gap = 10;
  const margin = 12;
  const width = Math.max(220, Math.min(340, vw - margin * 2));
  const clampRight = (r: number) => Math.min(Math.max(margin, r), vw - width - margin);
  const above = bot.top - gap - margin;
  if (above >= 260) return { right: clampRight(vw - bot.right), bottom: vh - bot.top + gap, width, maxHeight: above };
  // beside Sprout (or filling the screen): stay clear of the bars along the bottom that sit in the menu's columns
  const room = bot.left - gap - margin;
  const w = room >= 220 ? Math.min(width, room) : Math.min(width, vw - margin * 2);
  const right = room >= 220 ? vw - bot.left + gap : margin;
  const left = vw - right - w;
  const floor = docks
    .filter((d) => d.top > vh * 0.45 && d.right > left && d.left < left + w)
    .reduce((lowest, d) => Math.min(lowest, d.top - gap), vh - margin);
  return { right, bottom: vh - floor, width: w, maxHeight: Math.max(120, floor - margin) };
}

/** Whether two boxes overlap (used by the layout checks). */
export function overlaps(a: Box, b: Box): boolean {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}
