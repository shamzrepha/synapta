import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServerEnv, resetCachedEnv } from "./env";

describe("lib/env (A1.2 Canonical and Legacy Firebase Admin Env Resolution)", () => {
  const originalEnv = { ...process.env };

  const validClientEnv = {
    NEXT_PUBLIC_FIREBASE_API_KEY: "mock-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "mock.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "mock-project",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "mock.appspot.com",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:mock",
    GEMINI_API_KEY: "mock-gemini-key",
  };

  beforeEach(() => {
    resetCachedEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetCachedEnv();
  });

  it("succeeds when only canonical FIREBASE_ADMIN_* variables are present", () => {
    process.env = {
      ...validClientEnv,
      FIREBASE_ADMIN_PROJECT_ID: "canonical-project",
      FIREBASE_ADMIN_CLIENT_EMAIL: "admin@canonical.iam.gserviceaccount.com",
      FIREBASE_ADMIN_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
    };
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    const env = getServerEnv();
    expect(env.FIREBASE_ADMIN_PROJECT_ID).toBe("canonical-project");
    expect(env.FIREBASE_ADMIN_CLIENT_EMAIL).toBe("admin@canonical.iam.gserviceaccount.com");
  });

  it("succeeds when only legacy FIREBASE_* variables are present", () => {
    process.env = {
      ...validClientEnv,
      FIREBASE_PROJECT_ID: "legacy-project",
      FIREBASE_CLIENT_EMAIL: "admin@legacy.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
    };
    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;

    const env = getServerEnv();
    expect(env.FIREBASE_ADMIN_PROJECT_ID).toBe("legacy-project");
    expect(env.FIREBASE_ADMIN_CLIENT_EMAIL).toBe("admin@legacy.iam.gserviceaccount.com");
  });

  it("fails with a descriptive error when neither canonical nor legacy names exist", () => {
    process.env = {
      ...validClientEnv,
    };
    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    expect(() => getServerEnv()).toThrowError(/Missing or invalid server environment variables/);
  });
});
