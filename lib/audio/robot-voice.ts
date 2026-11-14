/**
 * Sprout's reading voice plays through one shared audio element. There is no sound effect on it any more: Sprout reads in a plain,
 * very high child's voice (the voice itself is chosen on the server). The name stays so the callers keep working.
 */
export interface RobotAudio {
  el: HTMLAudioElement;
  /** kept for the callers: nothing to wake without an effect chain */
  wake: () => void;
}

let shared: RobotAudio | null = null;

export function robotAudio(): RobotAudio {
  if (shared) return shared;
  const el = new Audio();
  el.preload = "auto";
  shared = { el, wake: () => {} };
  return shared;
}
