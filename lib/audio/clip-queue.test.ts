import { describe, it, expect } from "vitest";
import { ClipQueue } from "./clip-queue";

function deferredLoader() {
  const calls: number[] = [];
  let active = 0;
  let maxActive = 0;
  const resolvers = new Map<number, (v: string | null) => void>();
  const load = (i: number) =>
    new Promise<string | null>((resolve) => {
      calls.push(i);
      active++;
      maxActive = Math.max(maxActive, active);
      resolvers.set(i, (v) => {
        active--;
        resolve(v);
      });
    });
  return { load, calls, resolvers, max: () => maxActive };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("ClipQueue", () => {
  it("voices lines one after another in the background from the play position", async () => {
    const l = deferredLoader();
    const q = new ClipQueue(4, l.load);
    q.startFrom(0);
    await tick();
    expect(l.calls).toEqual([0]);
    l.resolvers.get(0)!("u0");
    await tick();
    expect(l.calls).toEqual([0, 1]);
    l.resolvers.get(1)!("u1");
    await tick();
    l.resolvers.get(2)!(null);
    await tick();
    l.resolvers.get(3)!("u3");
    await tick();
    expect(l.calls).toEqual([0, 1, 2, 3]);
    expect(l.max()).toBe(1);
    expect(q.status(2)).toBe("failed");
    expect(await q.get(3)).toBe("u3");
    expect(q.settledCount).toBe(4);
  });

  it("respects the look-ahead limit (warming only the first line)", async () => {
    const l = deferredLoader();
    const q = new ClipQueue(5, l.load);
    q.startFrom(0, 1);
    await tick();
    l.resolvers.get(0)!("u0");
    await tick();
    await tick();
    expect(l.calls).toEqual([0]);
  });

  it("lets the line being played jump the queue and dedupes requests", async () => {
    const l = deferredLoader();
    const q = new ClipQueue(6, l.load);
    q.startFrom(0);
    await tick();
    const p4 = q.get(4);
    const again = q.get(4);
    expect(l.calls).toEqual([0, 4]);
    l.resolvers.get(4)!("u4");
    expect(await p4).toBe("u4");
    expect(await again).toBe("u4");
  });

  it("turns blobs into object URLs and revokes them on dispose", async () => {
    const revoked: string[] = [];
    const q = new ClipQueue(1, async () => new Blob(["x"]), () => "blob:1", (u) => revoked.push(u));
    expect(await q.get(0)).toBe("blob:1");
    q.dispose();
    expect(revoked).toEqual(["blob:1"]);
  });

  it("resolves null when the loader throws", async () => {
    const q = new ClipQueue(1, async () => {
      throw new Error("network");
    });
    expect(await q.get(0)).toBeNull();
    expect(q.status(0)).toBe("failed");
  });
});
