import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted, sealForStorage, openFromStorage, encryptionStatus } from "./secret-box";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("secret-box", () => {
  const prev = process.env.SECRETS_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = prev;
  });

  it("round-trips and never contains the plaintext", () => {
    const enc = encryptSecret("gsk_supersecretvalue1234");
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("supersecret");
    expect(decryptSecret(enc)).toBe("gsk_supersecretvalue1234");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same-value-12345")).not.toBe(encryptSecret("same-value-12345"));
  });
  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("abcdefghij12345");
    const parts = enc.split(":");
    parts[4] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
  it("sealForStorage encrypts when configured and keeps working (plaintext) when not", () => {
    expect(isEncrypted(sealForStorage("plainkey-123456"))).toBe(true);
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(sealForStorage("plainkey-123456")).toBe("plainkey-123456");
  });
  it("openFromStorage flags legacy plaintext for re-encryption only when a key is configured", () => {
    expect(openFromStorage("legacy-plain-key")).toEqual({ value: "legacy-plain-key", needsReseal: true });
    const enc = encryptSecret("modern-key-123456");
    expect(openFromStorage(enc)).toEqual({ value: "modern-key-123456", needsReseal: false });
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(openFromStorage("legacy-plain-key")).toEqual({ value: "legacy-plain-key", needsReseal: false });
  });
  it("cannot read encrypted data without the key: returns empty, no throw", () => {
    const enc = encryptSecret("modern-key-123456");
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(openFromStorage(enc)).toEqual({ value: "", needsReseal: false, undecryptable: true });
  });
  it("reports status without leaking the key", () => {
    expect(encryptionStatus()).toEqual({ configured: true, warning: null });
    process.env.SECRETS_ENCRYPTION_KEY = "too-short";
    const s = encryptionStatus();
    expect(s.configured).toBe(false);
    expect(s.warning).toMatch(/SECRETS_ENCRYPTION_KEY/);
    expect(JSON.stringify(s)).not.toContain("too-short");
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(encryptionStatus().configured).toBe(false);
  });
  it("accepts a 64-char hex key", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "ab".repeat(32);
    expect(decryptSecret(encryptSecret("hex-key-value-1"))).toBe("hex-key-value-1");
  });
});
