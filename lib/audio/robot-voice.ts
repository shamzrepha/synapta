/**
 * Sprout's reading voice: the small, bright Edge voice sent by the server, run through a light "robot" effect in the browser so it
 * sounds like the app's AI reading to you. Natural voices are kept for the podcast. The effect is a fast tremolo (the buzz), a high-pass
 * (a little tinny), and gentle bit-crushing, all with Web Audio, so nothing extra is sent or stored.
 */
export interface RobotAudio {
  el: HTMLAudioElement;
  /** call from a tap or click: browsers keep the audio context asleep until a person has touched the page */
  wake: () => void;
}

type Ctor = typeof AudioContext;

let shared: RobotAudio | null = null;

export function robotAudio(): RobotAudio {
  if (shared) return shared;
  const el = new Audio();
  el.preload = "auto";
  let ctx: AudioContext | null = null;
  try {
    const AC: Ctor | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      const src = ctx.createMediaElementSource(el);
      const high = ctx.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 170;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 7200;
      // the buzz: the volume wobbles about 36 times a second
      const buzz = ctx.createGain();
      buzz.gain.value = 0.66;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 44;
      const depth = ctx.createGain();
      depth.gain.value = 0.34;
      osc.connect(depth).connect(buzz.gain);
      osc.start();
      // light bit-crush: the signal is rounded to a few dozen steps
      const crush = ctx.createWaveShaper();
      const steps = 18;
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.round(x * steps) / steps;
      }
      crush.curve = curve;
      const lift = ctx.createDynamicsCompressor();
      // a short feedback delay gives the tinny, metallic ring of a speaker grille
      const mix = ctx.createGain();
      const comb = ctx.createDelay(0.05);
      comb.delayTime.value = 0.0042;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.38;
      comb.connect(feedback).connect(comb);
      comb.connect(mix);
      src.connect(high).connect(low).connect(crush).connect(buzz);
      buzz.connect(mix);
      buzz.connect(comb);
      mix.connect(lift).connect(ctx.destination);
    }
  } catch {
    ctx = null; // no effect: the plain voice still plays
  }
  shared = {
    el,
    wake: () => {
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    },
  };
  return shared;
}
