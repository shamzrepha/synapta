/**
 * Sprout's reading voice plays through one shared audio element with formant shifting (preservesPitch = false)
 * so the vocal tract formants and pitch sound like a lively, high-pitched child cartoon character.
 */
export interface RobotAudio {
  el: HTMLAudioElement;
  /** kept for the callers: nothing to wake without an effect chain */
  wake: () => void;
}

let shared: RobotAudio | null = null;

export function applyCartoonVoice(el: HTMLAudioElement, userRate = 1, isFallbackAdult = false): void {
  try {
    const pitchable = el as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    pitchable.preservesPitch = false;
    pitchable.mozPreservesPitch = false;
    pitchable.webkitPreservesPitch = false;
    const formantLift = isFallbackAdult ? 1.28 : 1.18;
    el.playbackRate = Math.max(0.65, Math.min(2.2, userRate * formantLift));
  } catch {
    /* ignore in unsupported environments */
  }
}

export function robotAudio(): RobotAudio {
  if (shared) return shared;
  const el = new Audio();
  el.preload = "auto";
  applyCartoonVoice(el, 1);
  shared = { el, wake: () => {} };
  return shared;
}
