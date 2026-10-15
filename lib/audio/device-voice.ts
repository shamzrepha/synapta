import { pickDeviceVoices } from "./gapless";

/**
 * Last-resort narration with the device's own voices: one female and one male voice for the two
 * speakers (picked by name when possible, otherwise told apart by pitch).
 */
export function speakDevice(text: string, gender: "female" | "male", rate: number, done: () => void): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return done();
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  const voices = synth.getVoices();
  const picked = pickDeviceVoices(voices.map((v) => ({ name: v.name, lang: v.lang })));
  if (picked) {
    // pickDeviceVoices indexes into the full list passed in
    u.voice = voices[gender === "female" ? picked.female : picked.male] || null;
  }
  // Strong pitch difference helps even when both voices are the same gender
  u.pitch = gender === "female" ? 1.25 : 0.8;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
  };
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
}

export function cancelDevice(): void {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
