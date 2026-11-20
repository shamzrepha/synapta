# Security hardening

## What changed

1. **Write rate limit (proxy.ts, lib/security/api-guard.ts).** The limiter is now keyed by client IP only (first `x-forwarded-for` hop, then `x-real-ip`, else one shared "unknown" bucket; malformed values are ignored). A token is never used as a key and never trusted: the proxy cannot verify it, so a different junk token per request no longer creates a new bucket. A request that carries a credential still gets the higher per-IP limit (240/min vs 60/min); real per-user limits run in the routes after `requireUser`.
2. **Provider keys encrypted at rest (lib/security/secret-box.ts).** AES-256-GCM, format `enc:v1:iv:tag:ciphertext`, key from `SECRETS_ENCRYPTION_KEY`. Applies to `secrets/gemini`, `secrets/groq`, `secrets/openrouter` and `secrets/aiProviders`. Legacy plaintext is read as before and re-encrypted automatically on the next read once the env var is set. If the env var is missing or invalid, everything keeps working in plaintext and the admin key screens return `encryptionWarning`. Keys are never logged or returned (only last 4 characters).
3. **AI pause and spend cap (lib/ai/guard.ts).** `assertAiActive({spend:true})` now guards TTS, TTS read, STT, notebook voice and Worlds `generateStructured` (admin test and conformance runs pass `system: true` so health checks still work). `generateStructuredJson` accepts `userId`; the three class routes pass it, so the pause switch and OpenRouter cap apply (token quota stays with those routes' own `checkRateLimitAndQuota`, to avoid double charging). `GET /api/classes/[id]/map` has a shared 60/min limit.
4. **Shared rate limits.** 110 `checkRateLimit` calls in API routes now use `shared: true`. `app/api/rate-limit-shared.test.ts` fails CI for any new call without it, except a short allow-list of cheap, chatty endpoints (typing, presence, likes, telemetry).
5. **Headers (next.config.ts).** Production CSP drops `'unsafe-eval'` (kept in development, where Next needs it) and adds `upgrade-insecure-requests`; `frame-ancestors 'none'` kept; `Cross-Origin-Opener-Policy: same-origin-allow-popups` (Google sign-in popups keep working); `Permissions-Policy` camera and microphone `self` only; Referrer-Policy unchanged (`strict-origin-when-cross-origin`). `'unsafe-inline'` for scripts remains because Next's inline bootstrap scripts need it until nonces are added.
6. **.env.example** lists every env var name the code reads (names and comments only).
7. **Dependencies.** `npm audit --omit=dev`: 0 critical, 1 high (`zod`, fix is a semver-major upgrade, not applied), 5 moderate, 5 low. No `npm audit fix` was run.
8. **Secrets sweep (names only).** Tracked tree: placeholders in `README.md` and `.github/workflows/ci.yml` (truncated examples), test fixtures (`lib/ai/groq.test.ts`, `lib/ai/openrouter.test.ts`, `lib/env.test.ts`, `lib/push/config-check.test.ts`, `lib/security/secret-box.test.ts`), the audit doc, and a pattern false-positive inside `public/sunroot-3.2.apk` and `public/sunroot-3.3.apk`. History: pattern hits in commits `7fc4381` (OpenRouter test fixtures) and `2e1cd0a` (the `.agent/` skills import). No real key was confirmed, but the founder should open those two commits once and rotate anything that looks real.
9. **Audit log (lib/security/audit.ts).** New `auditLogs` entries: `ai_key.saved/removed` (Gemini, Groq, OpenRouter, Worlds providers; last 4 only), `ai_provider.changed`, `ai_config.saved`, `ai_models.assigned`, `ai_spend.cap_changed`, `voice.config_changed`, `billing.config_updated`, `billing.plan_grant/remove/reset/test/untest`, `broadcast.sent`. Secret-looking detail fields are stripped.
10. **Brute force.** Join-by-code (classes, groups, communities, schools), referral claims, profile setup, auth session/restore/bootstrap, billing checkout/verify now use shared limits.

## What the founder must set

- `SECRETS_ENCRYPTION_KEY` in Vercel and Coolify: `openssl rand -base64 32`. Back it up. If it is lost, stored provider keys cannot be read; re-enter them in Admin. After it is set, open Admin once (or wait for traffic) so legacy keys re-encrypt.
- `CRON_SECRET`, `APP_URL` and the other names in `.env.example` where used.
- Behind Cloudflare/Coolify, make sure the origin is not reachable directly, otherwise `x-forwarded-for` can be spoofed.

## What remains

- Script `'unsafe-inline'`: move to nonces.
- `zod` high advisory needs a planned major upgrade.
- `admin/autonomous` and a few Worlds read routes have no audit entry.
- Join codes are short: add per-code attempt lockout.
- Verify in a real browser that nothing needs `'unsafe-eval'` in production (three.js, blockly, mermaid, katex, sim iframe); a console CSP error would show it.
- Rotate keys if the history commits above contain real values.
