# Synapta — Architecture & Design Decisions (DECISIONS.md)

This log records architectural and design decisions, trade-offs, and deviations or clarifications throughout the build of Synapta.

---

## Decision 1: Authentication & Identity Model
- **Context:** The draft research paper proposed a deterministic email-derived user ID for passwordless access.
- **Decision:** As mandated by the Master Prompt Section 8, we strictly use standard Firebase Authentication (Email/Password + Google OAuth). The primary user identifier is Firebase `uid`.
- **Rationale:** Email-derived identifiers allow identity impersonation without authentication proof. Firebase Auth provides cryptographically signed ID tokens and session cookies with role claims.

## Decision 2: Role Management & Custom Claims
- **Context:** Synapta supports three roles (`student`, `teacher`, `admin`).
- **Decision:** Roles are stored in Firebase Auth custom claims (`{ role: "student" | "teacher" | "admin" }`) AND mirrored in Firestore `users/{uid}.role`.
- **Rationale:** Custom claims allow zero-database latency route protection in Next.js middleware and token verification, while the Firestore mirror enables administrative queries and profile rendering.

## Decision 3: Server-Side AI SDK & Model Configuration
- **Context:** Google Gemini models evolve, and server credentials must never leak.
- **Decision:** Use the official `@google/genai` SDK strictly inside server route handlers (`runtime = "nodejs"`). Model identifier is resolved dynamically from `process.env.GEMINI_MODEL` (e.g., `gemini-3.8-flash`), with automated fallback and sanitization for legacy identifiers.
- **Rationale:** Guarantees zero client bundle leakage of API keys, and allows model upgrades without code changes.

## Decision 4: Rate Limiting & Token Quota
- **Context:** AI generation calls must be protected against abuse and exhaustion.
- **Decision:** Rate limiting uses a sliding-window in-memory map per user (max 10 calls/minute), and monthly token quotas are tracked transactionally in Firestore `users/{uid}.monthlyTokensUsed` and `usage/{uid_YYYY-MM}`.
- **Rationale:** In-memory rate limiting suffices for single-instance or serverless cold-start windows in v1; transactional Firestore writes ensure strict quota enforcement across distributed serverless executions.

## Decision 5: Client-Side PDF Text Extraction
- **Context:** Firebase Storage on new Google Cloud projects requires a paid plan (Blaze) in v1.
- **Decision:** PDF parsing is performed client-side using `pdfjs-dist`, and only extracted text chunks are transmitted to `/api/notebook/sources`.
- **Rationale:** Completely avoids paid storage requirements while delivering instant in-memory text parsing with zero cloud storage costs.

## Decision 6: Styling & Theme Architecture
- **Context:** Clean, calm aesthetic avoiding generic purple gradients; full light & dark mode support.
- **Decision:** Custom CSS design system with CSS custom variables for Deep Ink (`#0B0F14`), Warm Off-White (`#F7F6F2`), Teal accent (`#14B8A6`), and Amber secondary (`#F59E0B`). Persisted via `synapta-theme` in `localStorage` and applied to `<html>` class.
- **Rationale:** Ensures high contrast (WCAG AA), accessible focus rings, and seamless hydration without flash of unstyled theme.

## Decision 7: Centralized ApiError & Leaked Provider Information Defense (A2)
- **Context:** Heterogeneous errors across auth, class authorization, rate-limiting, and AI exhaustion previously returned generic 500s or leaked raw provider JSON payloads (e.g. Google Cloud 429 quota failure dumps).
- **Decision:** Centralized `ApiError` base class in `lib/api/errors.ts` extended by `AuthError`, `ClassAccessError`, `QuotaError`, and `AiQuotaExhaustedError`. Enforced uniform `{ ok: false, error: { code, message, requestId? } }` responses via `toErrorResponse(err, requestId)`. Mask unhandled 500 exceptions with opaque error messages while capturing request IDs for server-side logs. Intercept any leaked upstream provider quota payloads and map them to friendly `AI_QUOTA_EXHAUSTED` responses with `Retry-After` headers.
- **Rationale:** Prevents information disclosure vulnerabilities, protects users from cryptic provider payloads, and guarantees uniform client error contracts.

