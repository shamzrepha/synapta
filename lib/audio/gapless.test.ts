import { describe, it, expect, vi } from "vitest";
import { GaplessPlayer, pickDeviceVoices, type ContextLike, type SourceLike } from "./gapless";

function fakeContext() {
  const sources: Array<SourceLike & { startedAt?: number; stopped?: boolean }> = [];
  const ctx: ContextLike & { time: number; sources: typeof sources } = {
    time: 0,
    sources,
    get currentTime() {
      return this.time;
    },
    set currentTime(v: number) {
      this.time = v;
    },
    destination: {},
    createBufferSource() {
      const s: SourceLike & { startedAt?: number; stopped?: boolean } = {
        buffer: null,
        playbackRate: { value: 1 },
        connect: () => undefined,
        disconnect: () => undefined,
        start(when = 0) {
          this.startedAt = when;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(s);
      return s;
    },
    // a clip's duration in seconds = its byte length / 1000
    decodeAudioData: async (d: ArrayBuffer) => ({ duration: d.byteLength / 1000 }),
    resume: async () => undefined,
    suspend: async () => undefined,
  };
  return ctx;
}

const bytes = (sec: number) => new ArrayBuffer(sec * 1000);
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(durations: Array<number | null>, extra: Record<string, unknown> = {}) {
  const ctx = fakeContext();
  const pending: Array<{ i: number; resolve: (v: ArrayBuffer | null) => void }> = [];
  const calls: number[] = [];
  const events = { index: [] as number[], buffering: [] as boolean[], ended: 0, spoken: [] as number[] };
  const player = new GaplessPlayer({
    count: durations.length,
    autoTick: false,
    createContext: () => ctx,
    fetchClip: (i) => {
      calls.push(i);
      if (extra.manual) return new Promise((resolve) => pending.push({ i, resolve }));
      const d = durations[i];
      return Promise.resolve(d === null ? null : bytes(d));
    },
    ...(extra.noFallback
      ? {}
      : {
          speakFallback: (i: number, _rate: number, done: () => void) => {
            events.spoken.push(i);
            (extra.onSpeak as ((done: () => void) => void) | undefined)?.(done);
          },
          cancelFallback: () => undefined,
        }),
    onIndex: (i) => events.index.push(i),
    onBuffering: (b) => events.buffering.push(b),
    onEnd: () => events.ended++,
  });
  return { player, ctx, pending, calls, events };
}

describe("GaplessPlayer", () => {
  it("never falls back to a robot voice: a line with no recording is skipped", async () => {
    const { player, ctx, events } = make([1, null, 1], { noFallback: true });
    player.preload(0);
    await flush();
    player.play(0);
    await flush();
    ctx.time = 5;
    player.tick();
    await flush();
    expect(events.spoken).toEqual([]);
    expect(ctx.sources).toHaveLength(2); // line 0 and line 2 were played; line 1 was skipped
  });

  it("fetches many lines at once in the background, not one at a time", async () => {
    const { player, calls, pending } = make([2, 2, 2, 2, 2], { manual: true });
    player.preload(0);
    expect(calls).toEqual([0, 1, 2]); // 3 in flight immediately
    pending[0].resolve(bytes(2));
    await flush();
    expect(calls).toEqual([0, 1, 2, 3]); // the next starts as soon as one finishes
  });

  it("schedules lines back to back so there is no gap between them", async () => {
    const { player, ctx } = make([2, 3, 1]);
    player.preload(0);
    await flush();
    player.play(0);
    await flush();
    const starts = ctx.sources.map((s) => s.startedAt!);
    expect(starts).toHaveLength(3);
    expect(starts[1]).toBeCloseTo(starts[0] + 2 + 0.14, 5);
    expect(starts[2]).toBeCloseTo(starts[1] + 3 + 0.14, 5);
  });

  it("waits (buffering) when the next line isn't ready, then continues seamlessly", async () => {
    const { player, ctx, pending, events } = make([2, 2], { manual: true });
    player.play(0);
    pending.find((p) => p.i === 0)!.resolve(bytes(2));
    await flush();
    expect(ctx.sources).toHaveLength(1);
    // line 0 is playing; line 1 still loading
    ctx.time = 1;
    player.tick();
    expect(ctx.sources).toHaveLength(1);
    pending.find((p) => p.i === 1)!.resolve(bytes(2));
    await flush();
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[1].startedAt).toBeCloseTo(ctx.sources[0].startedAt! + 2.14, 5);
    expect(events.buffering[0]).toBe(true); // initially buffering until line 0 arrived
  });

  it("reports the current line from the audio clock and finishes", async () => {
    const { player, ctx, events } = make([1, 1]);
    player.play(0);
    await flush();
    ctx.time = 10;
    player.tick();
    expect(events.index).toContain(0);
    ctx.time = 100;
    player.tick();
    expect(events.ended).toBe(1);
  });

  it("reads an unvoiceable line with the device voice only after queued audio finishes, then carries on", async () => {
    let finishSpeech: (() => void) | null = null;
    const { player, ctx, events } = make([1, null, 1], { onSpeak: (done: () => void) => (finishSpeech = done) });
    player.preload(0);
    await flush();
    player.play(0);
    await flush();
    expect(events.spoken).toEqual([]); // line 0 still playing
    expect(ctx.sources).toHaveLength(1);
    ctx.time = 5;
    player.tick();
    expect(events.spoken).toEqual([1]);
    expect(ctx.sources).toHaveLength(1); // line 2 waits for the spoken line
    finishSpeech!();
    await flush();
    expect(ctx.sources).toHaveLength(2);
  });

  it("jumping to another line restarts the schedule from there", async () => {
    const { player, ctx } = make([2, 2, 2]);
    player.preload(0);
    await flush();
    player.play(0);
    await flush();
    player.jump(2);
    await flush();
    expect(ctx.sources.slice(0, 3).every((s) => s.stopped)).toBe(true);
    expect(ctx.sources[ctx.sources.length - 1].startedAt).toBeGreaterThanOrEqual(0);
    expect(ctx.sources).toHaveLength(4);
  });

  it("changing speed re-times queued lines without gaps", async () => {
    const { player, ctx } = make([4, 4]);
    player.preload(0);
    await flush();
    player.play(0);
    await flush();
    const first = ctx.sources[0];
    ctx.time = first.startedAt! + 1; // 1 s into line 0 at 1×
    player.setRate(2);
    // remaining 3 s of media at 2× = 1.5 s, so line 1 should start at now + 1.5 + gap
    const second = ctx.sources[ctx.sources.length - 1];
    expect(second.startedAt).toBeCloseTo(ctx.time + 1.5 + 0.14, 5);
    expect(second.playbackRate.value).toBe(2);
  });
});

describe("pickDeviceVoices", () => {
  it("prefers a named female and a named male voice", () => {
    const v = [
      { name: "Google UK English Male", lang: "en-GB" },
      { name: "Google UK English Female", lang: "en-GB" },
      { name: "Anna", lang: "de-DE" },
    ];
    expect(pickDeviceVoices(v)).toEqual({ female: 1, male: 0 });
  });
  it("still picks two different voices when names don't say", () => {
    expect(pickDeviceVoices([{ name: "Voice A", lang: "en-US" }, { name: "Voice B", lang: "en-US" }])).toEqual({ female: 0, male: 1 });
  });
  it("returns null with no English voices", () => {
    expect(pickDeviceVoices([{ name: "Anna", lang: "de-DE" }])).toBeNull();
    expect(vi.isMockFunction(pickDeviceVoices)).toBe(false);
  });
});
