import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/requireUser", () => ({
  requireUser: vi.fn().mockResolvedValue({ uid: "user-1", email: "kid@sunroot.test", role: "student" }),
  handleAuthError: vi.fn((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Auth error";
    return new Response(JSON.stringify({ ok: false, error: { code: "ERR", message: msg } }), { status: 500 });
  }),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

const transcribeMock = vi.fn();
vi.mock("@/lib/ai/groq", () => ({
  transcribeAudioWithGroq: (...args: unknown[]) => transcribeMock(...args),
}));

import { POST } from "./route";

describe("POST /api/stt", () => {
  beforeEach(() => {
    transcribeMock.mockReset();
  });

  it("returns 400 when audio field is missing", async () => {
    const fd = new FormData();
    const req = new NextRequest("http://localhost/api/stt", { method: "POST", body: fd });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns 200 with transcribed text when audio blob is provided", async () => {
    transcribeMock.mockResolvedValue("What is photosynthesis?");
    const fd = new FormData();
    fd.append("audio", new Blob(["fake-audio-bytes"], { type: "audio/webm" }), "voice.webm");
    fd.append("language", "en");
    const req = new NextRequest("http://localhost/api/stt", { method: "POST", body: fd });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, data: { text: "What is photosynthesis?" } });
  });

  it("returns 503 when Groq key is not configured", async () => {
    transcribeMock.mockRejectedValue(new Error("Groq STT is unavailable: no Groq API key configured"));
    const fd = new FormData();
    fd.append("audio", new Blob(["fake-audio-bytes"], { type: "audio/webm" }), "voice.webm");
    const req = new NextRequest("http://localhost/api/stt", { method: "POST", body: fd });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });
});
