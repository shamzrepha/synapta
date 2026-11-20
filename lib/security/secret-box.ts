import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for provider API keys stored in Firestore `secrets/*`.
 * Key: server-only env SECRETS_ENCRYPTION_KEY, 32 bytes as base64 or 64 hex chars (`openssl rand -base64 32`).
 * Stored form: `enc:v1:<iv>:<tag>:<ciphertext>` (all base64). Anything else is legacy plaintext.
 * Without the env var everything keeps working in plaintext (no data loss) and the admin screens show a warning.
 */

const PREFIX = "enc:v1:";

function loadKey(): Buffer | null {
  const raw = (process.env.SECRETS_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b = Buffer.from(raw, "base64");
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

export function isEncrypted(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY is not set or is not 32 bytes");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const key = loadKey();
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY is not set or is not 32 bytes");
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

/** What to write to Firestore: ciphertext when a valid key is configured, else the plain value (never loses the key). */
export function sealForStorage(plain: string): string {
  return loadKey() && plain ? encryptSecret(plain) : plain;
}

/** Reads a stored value. `needsReseal` = legacy plaintext that should be re-written encrypted now. Never throws. */
export function openFromStorage(stored: unknown): { value: string; needsReseal: boolean; undecryptable?: true } {
  if (typeof stored !== "string" || !stored) return { value: "", needsReseal: false };
  if (!isEncrypted(stored)) return { value: stored, needsReseal: !!loadKey() };
  try {
    return { value: decryptSecret(stored), needsReseal: false };
  } catch {
    return { value: "", needsReseal: false, undecryptable: true };
  }
}

export function encryptionStatus(): { configured: boolean; warning: string | null } {
  if (loadKey()) return { configured: true, warning: null };
  const set = !!(process.env.SECRETS_ENCRYPTION_KEY || "").trim();
  return {
    configured: false,
    warning: set
      ? "SECRETS_ENCRYPTION_KEY is set but is not a valid 32-byte key (base64 or 64 hex characters). Provider keys are stored unencrypted until it is fixed."
      : "SECRETS_ENCRYPTION_KEY is not set, so provider API keys are stored unencrypted in Firestore. Set it in Vercel/Coolify (openssl rand -base64 32) and keys are encrypted automatically.",
  };
}

/** Best-effort legacy upgrade: rewrites one field of a Firestore doc as ciphertext. Never throws, never logs the value. */
export async function resealField(ref: { update(data: Record<string, unknown>): Promise<unknown> }, field: string, plain: string): Promise<void> {
  try {
    await ref.update({ [field]: encryptSecret(plain) });
  } catch {
    /* try again on the next read */
  }
}
