import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1, "NEXT_PUBLIC_FIREBASE_API_KEY is required"),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is required"),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1, "NEXT_PUBLIC_FIREBASE_PROJECT_ID is required"),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is required"),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1, "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is required"),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1, "NEXT_PUBLIC_FIREBASE_APP_ID is required"),
});

import { DEFAULT_MODEL_CONFIG, sanitizeModelId } from "./ai/models";

export { sanitizeModelId, DEFAULT_MODEL_CONFIG };
export const DEFAULT_GEMINI_MODEL = DEFAULT_MODEL_CONFIG.tutor;

const serverEnvSchema = clientEnvSchema.extend({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1, "FIREBASE_ADMIN_PROJECT_ID is required"),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1, "FIREBASE_ADMIN_CLIENT_EMAIL is required"),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1, "FIREBASE_ADMIN_PRIVATE_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default(DEFAULT_MODEL_CONFIG.legacy).transform((m) => sanitizeModelId(m, DEFAULT_MODEL_CONFIG.legacy)),
  GEMINI_MODEL_TUTOR: z.string().default(DEFAULT_MODEL_CONFIG.tutor).transform((m) => sanitizeModelId(m, DEFAULT_MODEL_CONFIG.tutor)),
  GEMINI_MODEL_STRUCTURED: z.string().default(DEFAULT_MODEL_CONFIG.structured).transform((m) => sanitizeModelId(m, DEFAULT_MODEL_CONFIG.structured)),
  GEMINI_MODEL_LONGDOC: z.string().default(DEFAULT_MODEL_CONFIG.longdoc).transform((m) => sanitizeModelId(m, DEFAULT_MODEL_CONFIG.longdoc)),
  GEMINI_MODEL_BUILD: z.string().default(DEFAULT_MODEL_CONFIG.build).transform((m) => sanitizeModelId(m, DEFAULT_MODEL_CONFIG.build)),
  GEMINI_MODEL_GRADING: z.string().default(DEFAULT_MODEL_CONFIG.grading).transform((m) => sanitizeModelId(m, DEFAULT_MODEL_CONFIG.grading)),
  GEMINI_MODEL_VOICE: z.string().default(DEFAULT_MODEL_CONFIG.voice).transform((m) => sanitizeModelId(m, DEFAULT_MODEL_CONFIG.voice)),
  GEMINI_CHAIN_LIGHT: z.string().default(DEFAULT_MODEL_CONFIG.chainLight.join(",")),
  GEMINI_CHAIN_HEAVY: z.string().default(DEFAULT_MODEL_CONFIG.chainHeavy.join(",")),
  GEMINI_MODEL_OVERFLOW: z.string().default(DEFAULT_MODEL_CONFIG.overflow),
  GEMINI_MODEL_FALLBACK: z.string().default("gemini-3.5-flash-lite").transform((m) => sanitizeModelId(m, "gemini-3.5-flash-lite")),
  GEMINI_FALLBACK_CHAIN: z.string().default(""),
  GEMINI_RPD_LIMITS: z.string().default(""),
  ADMIN_EMAILS: z.string().default(""),
  STUDENT_TOKEN_LIMIT: z.coerce.number().default(50000),
  TEACHER_TOKEN_LIMIT: z.coerce.number().default(200000),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;
let cachedClientEnv: ClientEnv | null = null;

export function getClientEnv(): ClientEnv {
  if (cachedClientEnv) return cachedClientEnv;

  const raw = {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const result = clientEnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Missing or invalid client environment variables: ${issues}`);
  }

  cachedClientEnv = result.data;
  return cachedClientEnv;
}

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv cannot be called on the client side.");
  }

  if (cachedServerEnv) return cachedServerEnv;

  const raw = {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || DEFAULT_MODEL_CONFIG.legacy,
    GEMINI_MODEL_TUTOR: process.env.GEMINI_MODEL_TUTOR || DEFAULT_MODEL_CONFIG.tutor,
    GEMINI_MODEL_STRUCTURED: process.env.GEMINI_MODEL_STRUCTURED || DEFAULT_MODEL_CONFIG.structured,
    GEMINI_MODEL_LONGDOC: process.env.GEMINI_MODEL_LONGDOC || DEFAULT_MODEL_CONFIG.longdoc,
    GEMINI_MODEL_BUILD: process.env.GEMINI_MODEL_BUILD || DEFAULT_MODEL_CONFIG.build,
    GEMINI_MODEL_GRADING: process.env.GEMINI_MODEL_GRADING || DEFAULT_MODEL_CONFIG.grading,
    GEMINI_MODEL_VOICE: process.env.GEMINI_MODEL_VOICE || DEFAULT_MODEL_CONFIG.voice,
    GEMINI_CHAIN_LIGHT: process.env.GEMINI_CHAIN_LIGHT || DEFAULT_MODEL_CONFIG.chainLight.join(","),
    GEMINI_CHAIN_HEAVY: process.env.GEMINI_CHAIN_HEAVY || DEFAULT_MODEL_CONFIG.chainHeavy.join(","),
    GEMINI_MODEL_OVERFLOW: process.env.GEMINI_MODEL_OVERFLOW || DEFAULT_MODEL_CONFIG.overflow,
    GEMINI_MODEL_FALLBACK: process.env.GEMINI_MODEL_FALLBACK || "gemini-3.5-flash-lite",
    GEMINI_FALLBACK_CHAIN: process.env.GEMINI_FALLBACK_CHAIN || "",
    GEMINI_RPD_LIMITS: process.env.GEMINI_RPD_LIMITS || "",
    ADMIN_EMAILS: process.env.ADMIN_EMAILS || "",
    STUDENT_TOKEN_LIMIT: process.env.STUDENT_TOKEN_LIMIT || 50000,
    TEACHER_TOKEN_LIMIT: process.env.TEACHER_TOKEN_LIMIT || 200000,
  };

  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Missing or invalid server environment variables: ${issues}`);
  }

  cachedServerEnv = result.data;
  return cachedServerEnv;
}

export function resetCachedEnv(): void {
  cachedServerEnv = null;
  cachedClientEnv = null;
}
