import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1, "NEXT_PUBLIC_FIREBASE_API_KEY is required"),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is required"),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1, "NEXT_PUBLIC_FIREBASE_PROJECT_ID is required"),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is required"),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1, "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is required"),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1, "NEXT_PUBLIC_FIREBASE_APP_ID is required"),
});

export const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";

export function sanitizeModelId(model?: string | null): string {
  if (!model || typeof model !== "string") return DEFAULT_GEMINI_MODEL;
  const trimmed = model.trim();
  // Intercept obsolete/deprecated model identifiers or free-tier quota-capped previews
  if (
    trimmed.startsWith("gemini-2.") ||
    trimmed.startsWith("gemini-1.") ||
    trimmed.includes("gemini-2.5") ||
    trimmed.includes("gemini-2.0") ||
    trimmed.includes("gemini-1.5") ||
    trimmed.includes("gemini-3.1-pro") ||
    trimmed.includes("gemini-3.8-flash") // free tier capped at 20 requests/day
  ) {
    return DEFAULT_GEMINI_MODEL;
  }
  return trimmed || DEFAULT_GEMINI_MODEL;
}

const serverEnvSchema = clientEnvSchema.extend({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1, "FIREBASE_ADMIN_PROJECT_ID is required"),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1, "FIREBASE_ADMIN_CLIENT_EMAIL is required"),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1, "FIREBASE_ADMIN_PRIVATE_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default(DEFAULT_GEMINI_MODEL).transform(sanitizeModelId),
  GEMINI_MODEL_TUTOR: z.string().default("gemini-3.5-flash-lite").transform(sanitizeModelId),
  GEMINI_MODEL_STRUCTURED: z.string().default(DEFAULT_GEMINI_MODEL).transform(sanitizeModelId),
  GEMINI_MODEL_GRADING: z.string().default(DEFAULT_GEMINI_MODEL).transform(sanitizeModelId),
  GEMINI_MODEL_LONGDOC: z.string().default(DEFAULT_GEMINI_MODEL).transform(sanitizeModelId),
  GEMINI_MODEL_VOICE: z.string().default("gemini-3.8-live").transform(sanitizeModelId),
  GEMINI_MODEL_FALLBACK: z.string().default("gemini-3.6-flash").transform(sanitizeModelId),
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
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: sanitizeModelId(process.env.GEMINI_MODEL),
    GEMINI_MODEL_TUTOR: sanitizeModelId(process.env.GEMINI_MODEL_TUTOR || "gemini-3.5-flash-lite"),
    GEMINI_MODEL_STRUCTURED: sanitizeModelId(process.env.GEMINI_MODEL_STRUCTURED),
    GEMINI_MODEL_GRADING: sanitizeModelId(process.env.GEMINI_MODEL_GRADING),
    GEMINI_MODEL_LONGDOC: sanitizeModelId(process.env.GEMINI_MODEL_LONGDOC),
    GEMINI_MODEL_VOICE: sanitizeModelId(process.env.GEMINI_MODEL_VOICE || "gemini-3.8-live"),
    GEMINI_MODEL_FALLBACK: sanitizeModelId(process.env.GEMINI_MODEL_FALLBACK || "gemini-3.6-flash"),
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
