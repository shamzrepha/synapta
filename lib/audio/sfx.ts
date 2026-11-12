/**
 * Procedural Web Audio Sound Effects & Companion Vocalizations for Sunroot.
 * Zero external audio files required — 100% offline, low-latency, and mobile-friendly.
 */
import { PREFS_KEY, parsePrefs } from "@/lib/settings/prefs";

let ctx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx || ctx.state === "closed") {
    try {
      ctx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Sounds are on unless the learner turned them off in Settings (or asked for no autoplay / data saving). */
function isSoundAllowed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const p = parsePrefs(localStorage.getItem(PREFS_KEY));
    return p.soundEffects && !p.noAutoplay && !p.dataSaver;
  } catch {
    return true;
  }
}

/**
 * Tactile page flip sound effect.
 * Synthesizes a soft, textured paper rustle with filtered noise and a quick decay.
 */
export function playPageFlipSound() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  try {
    const duration = 0.16;
    const bufferSize = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);

    // Filtered pink-like paper noise
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }

    const noise = ac.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter to mimic paper texture
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(800, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1600, ac.currentTime + duration * 0.5);
    filter.frequency.exponentialRampToValueAtTime(400, ac.currentTime + duration);
    filter.Q.setValueAtTime(1.5, ac.currentTime);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.01, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    noise.start();
    noise.stop(ac.currentTime + duration);
  } catch {
    /* Ignore audio context errors */
  }
}

/**
 * Zippy rope whip / launch sound effect when Sprout fires the grapple.
 */
export function playRopeSwingSound() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const now = ac.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1250, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.28);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(now);
    osc.stop(now + 0.28);
  } catch {
    /* Ignore */
  }
}

/**
 * Satisfying mechanical ratchet / haul sound as the note rises up.
 */
export function playPopUpHaulSound() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  try {
    const now = ac.currentTime;
    const clicks = 3;
    for (let i = 0; i < clicks; i++) {
      const clickTime = now + i * 0.11;
      const osc = ac.createOscillator();
      const gain = ac.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(600 + i * 80, clickTime);
      osc.frequency.exponentialRampToValueAtTime(250, clickTime + 0.04);

      gain.gain.setValueAtTime(0.12, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.04);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start(clickTime);
      osc.stop(clickTime + 0.04);
    }
  } catch {
    /* Ignore */
  }
}

/**
 * Cute, playful Sprout voice synthesis (charming vocal chirps like Animal Crossing / Kirby).
 */
export function playCuteVoice(style: "happy" | "curious" | "cheer" | "search" = "happy") {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  try {
    const now = ac.currentTime;
    let notes: number[] = [523.25, 659.25, 783.99]; // C5, E5, G5
    if (style === "curious") notes = [440, 554.37, 659.25, 880];
    if (style === "cheer") notes = [587.33, 739.99, 880, 1174.66]; // D5, F#5, A5, D6
    if (style === "search") notes = [659.25, 587.33, 659.25];

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.08;
      const osc = ac.createOscillator();
      const gain = ac.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);
      // subtle cute vibrato/chirp
      osc.frequency.exponentialRampToValueAtTime(freq * 1.08, noteTime + 0.07);

      gain.gain.setValueAtTime(0.01, noteTime);
      gain.gain.linearRampToValueAtTime(0.16, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.08);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.09);
    });
  } catch {
    /* Ignore */
  }
}

/**
 * Gentle bubble pop sound when terms or cards open.
 */
export function playPopSound() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const now = ac.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.07);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch {
    /* Ignore */
  }
}
