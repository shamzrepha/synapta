import { describe, expect, it, vi } from "vitest";
import { checkMic, problemFromMediaError, problemFromRecognitionError } from "./mic";

const stream = () => {
  const stop = vi.fn();
  return { stop, s: { getTracks: () => [{ stop }] } };
};

describe("checkMic", () => {
  it("works and releases the microphone when it is allowed", async () => {
    const { stop, s } = stream();
    const r = await checkMic({ mediaDevices: { getUserMedia: async () => s } }, true);
    expect(r.ok).toBe(true);
    expect(stop).toHaveBeenCalled();
  });

  it("says the page must be secure", async () => {
    const r = await checkMic({}, false);
    expect(r).toMatchObject({ ok: false, problem: "insecure" });
  });

  it("reads a stored 'denied' without prompting", async () => {
    const gum = vi.fn();
    const r = await checkMic({ permissions: { query: async () => ({ state: "denied" }) }, mediaDevices: { getUserMedia: gum } }, true);
    expect(r).toMatchObject({ ok: false, problem: "blocked" });
    expect(gum).not.toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", "blocked"],
    ["NotFoundError", "missing"],
    ["NotReadableError", "busy"],
    ["WeirdError", "unknown"],
  ])("maps %s to %s", async (name, problem) => {
    const r = await checkMic({ mediaDevices: { getUserMedia: async () => Promise.reject(Object.assign(new Error("x"), { name })) } }, true);
    expect(r).toMatchObject({ ok: false, problem });
  });

  it("carries on when the permissions API doesn't know the microphone", async () => {
    const { s } = stream();
    const r = await checkMic({ permissions: { query: async () => Promise.reject(new TypeError("bad name")) }, mediaDevices: { getUserMedia: async () => s } }, true);
    expect(r.ok).toBe(true);
  });

  it("lets speech recognition ask for itself when there is no getUserMedia", async () => {
    expect((await checkMic({}, true)).ok).toBe(true);
  });
});

describe("error codes", () => {
  it("maps recognition errors", () => {
    expect(problemFromRecognitionError("not-allowed")).toBe("blocked");
    expect(problemFromRecognitionError("service-not-allowed")).toBe("service");
    expect(problemFromRecognitionError("network")).toBe("offline");
    expect(problemFromRecognitionError("no-speech")).toBeNull();
  });
  it("maps media errors", () => {
    expect(problemFromMediaError("SecurityError")).toBe("blocked");
  });
});
