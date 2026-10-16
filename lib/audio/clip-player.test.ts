import { describe, expect, it } from "vitest";
import { ClipPlayer, type AudioLike } from "./clip-player";

class FakeAudio implements AudioLike {
  src = "";
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  played = 0;
  paused = false;
  play() {
    this.played++;
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
}

const bytes = (n = 10) => new ArrayBuffer(n);
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(clips: Array<ArrayBuffer | null>, extra: { manual?: boolean } = {}) {
  const audios: FakeAudio[] = [];
  const events = { index: [] as number[], buffering: [] as boolean[], ended: 0 };
  const pending: Array<{ i: number; resolve: (v: ArrayBuffer | null) => void }> = [];
  const calls: number[] = [];
  const player = new ClipPlayer({
    count: clips.length,
    fetchClip: (i) => {
      calls.push(i);
      if (extra.manual) return new Promise((resolve) => pending.push({ i, resolve }));
      return Promise.resolve(clips[i]);
    },
    onIndex: (i) => events.index.push(i),
    onBuffering: (b) => events.buffering.push(b),
    onEnd: () => events.ended++,
    createAudio: () => {
      const a = new FakeAudio();
      audios.push(a);
      return a;
    },
    createUrl: (d) => `blob:${d.byteLength}`,
    revokeUrl: () => undefined,
  });
  return { player, audios, events, pending, calls };
}

describe("ClipPlayer (HTML5 audio)", () => {
  it("fetches several lines at once in the background", () => {
    const { player, calls } = make([bytes(), bytes(), bytes(), bytes(), bytes()], { manual: true });
    player.preload(0);
    expect(calls).toEqual([0, 1, 2]);
  });

  it("plays line after line, each starting when the previous one ends", async () => {
    const { player, audios, events } = make([bytes(), bytes(), bytes()]);
    player.preload(0);
    await flush();
    player.play(0);
    expect(audios[0].played).toBe(1);
    audios[0].onended!();
    expect(events.index).toEqual([0, 1]);
    const second = audios.find((a) => a.played === 1 && a !== audios[0])!;
    expect(second).toBeTruthy();
    second.onended!();
    const third = audios.find((a) => a.played === 1 && a !== audios[0] && a !== second)!;
    third.onended!();
    expect(events.ended).toBe(1);
    expect(player.isPlaying).toBe(false);
  });

  it("waits (buffering) for a line that isn't ready yet, then starts it", async () => {
    const { player, audios, events, pending } = make([bytes(), bytes()], { manual: true });
    player.play(0);
    expect(events.buffering).toEqual([true]);
    pending.find((p) => p.i === 0)!.resolve(bytes());
    await flush();
    expect(audios[0].played).toBe(1);
    expect(events.buffering).toEqual([true, false]);
  });

  it("skips a line with no saved recording and never speaks it with a device voice", async () => {
    const { player, audios, events } = make([bytes(), null, bytes()]);
    player.preload(0);
    await flush();
    player.play(0);
    audios[0].onended!();
    expect(events.index).toEqual([0, 1, 2]);
    expect(audios).toHaveLength(2); // lines 0 and 2 only
  });

  it("pauses, resumes, jumps and changes speed", async () => {
    const { player, audios } = make([bytes(), bytes(), bytes()]);
    player.preload(0);
    await flush();
    player.play(0);
    player.pause();
    expect(audios[0].paused).toBe(true);
    expect(player.isPaused).toBe(true);
    player.resume();
    expect(audios[0].played).toBe(2);
    player.setRate(1.5);
    expect(audios[0].playbackRate).toBe(1.5);
    player.jump(2);
    expect(audios[0].paused).toBe(true);
    expect(audios.some((a) => a.src === "blob:10" && a.played >= 1 && a !== audios[0])).toBe(true);
    player.stop();
    expect(player.isPlaying).toBe(false);
  });
});
