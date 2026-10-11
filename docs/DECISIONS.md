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

## Decision 8: XP & Mastery Integrity Defense (A3)
- **Context:** Vulnerabilities allowed client-claimed peer explain rewards, unbounded flashcard grind loops, repeat harvesting of +100 XP mastery bonuses by cycling mastery probabilities, and parallel double-scoring races in quiz sessions.
- **Decision:**
  1. Deprecated self-claimed `peer_explain` on `POST /api/evidence`; peer rewards must be granted by other peers via `POST /api/lounge/rooms/[roomCode]/credit` within an active study room.
  2. Rate-limited daily flashcard evidence submissions to 30/day per concept in `applyEvidence`.
  3. Added `masteryBonusAwardedAt` tracking in `mastery` documents to ensure the +100 XP mastery bonus is awarded strictly once per concept lifetime.
  4. Added `safeBktParams` to enforce model identifiability ($p_G + p_S < 1$) and sanitize priors.
  5. Transaction-wrapped quiz answering in `app/api/quiz/[sessionId]/answer` to atomically claim answers and eliminate parallel submission double-scoring.
- **Rationale:** Protects pedagogical integrity, prevents leaderboard exploitation, and mathematically guarantees valid BKT inference.

## Decision 9: Authorization Hardening & Security Rule Integrity (A4)
- **Context:** Study room endpoints (messages and scratchpad) were open to unjoined authenticated callers; non-admin users could attempt joining draft classes.
- **Decision:**
  1. Enforced room membership checks (`memberIds.includes(caller.uid) || caller.role === 'admin'`) in both `POST /api/lounge/rooms/[roomCode]/messages` and `PATCH /api/lounge/rooms/[roomCode]/scratchpad`.
  2. Enforced classroom published state check in `POST /api/classes/[id]/join`, rejecting student enrollments into draft classes.
  3. Verified Firestore rules allowlist patterns and user profile mutation constraints with unit test coverage.
## Decision 10: Course Schema, Prompt Injection Fencing, and Dynamic Task Model Routing (B1, B11, B7.1-B7.2)
- **Context:** Course data models required rigorous type safety for Knowledge Components, Lessons, Materials, and Assignments. Untrusted user content needed injection defense without corrupting STEM LaTeX equations. Teacher cache hash keys risked multi-tenant cross-class collisions. Model routing needed real-time administrative reassignment without redeploying.
- **Decision:**
  1. Established comprehensive Zod schemas and TypeScript models in `lib/validation/course.ts` and `lib/types/course.ts`.
  2. Implemented `createKc`, `updateKc`, and deduplicated `upsertAiKc` in `lib/teacher/kcStore.ts` with BKT parameter validation and slug stabilization.
  3. Created `fenceUntrusted` in `lib/ai/generate.ts` with XML tagging and closing delimiter neutralization.
  4. Updated `scrubPii` to protect LaTeX math blocks (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) during sanitization using a replacer function to avoid `$$` escape artifacting.
  5. Scoped `computeContentHash` with `classId` in `lib/teacher/cache.ts` for secure multi-tenant cache isolation.
  6. Added dynamic Firestore model routing via `systemConfig/aiModels` with 60-second in-memory caching and an administrative console UI.
- **Rationale:** Guarantees end-to-end data integrity for classroom curriculum generation, prevents prompt injection escapes, protects mathematical equations from regex damage, isolates cache spaces, and gives administrators instant operational control over Gemini model deployments.

## Decision 11: Real PDF Upload Pipeline & Map Proposal Rollback Isolation (B3-B4)
- **Context:** Course syllabus building required real PDF material uploads (textbooks, slides, past papers). Relying purely on Cloud Storage could fail if the storage bucket was unconfigured or lacked Blaze plan permissions. Curriculum proposals mutated the live concept map and needed atomic execution and full rollback snapshots.
- **Decision:**
  1. Implemented dual-path PDF upload in `components/teacher/MaterialsUploader.tsx`: uploads directly to Cloud Storage via signed PUT URL if available; if unconfigured or failing, automatically falls back to client-side text extraction using `extractTextFromFile` with `pdfjs-dist` and delivers `contentText` to `/complete`.
  2. Created `lib/pdf/extract.ts` as canonical extraction module interface.
  3. Built map proposal analysis and batch mutations in `lib/teacher/materialRouter.ts`: operations (`attach_material`, `add_kc`, `merge_into`) are atomically batched, creating a pre-mutation snapshot in `classes/{classId}/mapVersions` to allow complete rollback, and archiving merged nodes rather than destructively deleting them.
- **Rationale:** Delivers zero-config resilience for document ingestion across local and cloud environments, while ensuring non-destructive curriculum mutation with instant rollback capabilities.
