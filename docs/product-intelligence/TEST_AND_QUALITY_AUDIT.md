# Test and Quality Audit (read-only)

Audited 2026-11-19 by reading the repo. I did not run tests (no `node_modules` install was allowed). Counts come from `git ls-files '*.test.*'` excluding third-party `.agent/`, `.antigravity/`, `.claude/`. Evidence labels: Verified, Partially verified, Assumption, Unknown.

## 1. What CI really runs

`package.json` scripts: `verify` = `tsc --noEmit && eslint . && vitest run && npm run check:guards && npm run check:models && npm run test:acceptance`. `.github/workflows/ci.yml` ("CI Quality Gate", on push to main and PRs to main, Node 24, `npm ci`) runs `npm run verify` with mock Firebase/Gemini env vars. Two other workflows: `deploy-firestore.yml` (deploys rules and indexes on change, no rules tests run first) and `security-review.yml` (Claude PR review, skips silently without the key).

| Gate | What it enforces | What it does not |
|---|---|---|
| `tsc --noEmit` | `strict: true` type safety across the repo | no `noUncheckedIndexedAccess`; runtime shapes of Firestore data are untyped (`DocumentData`) |
| `eslint .` | `eslint-config-next` core-web-vitals + typescript, defaults only; 0 errors expected | no security plugin, no custom rules, no max-complexity; `public/`, `.agent/`, `.claude/` ignored |
| `vitest run` | 232 test files, node environment, 30 s timeout | no coverage threshold, no coverage report, `.claude/**` excluded |
| `check:guards` (`scripts/check-list-guards.mjs`) | greps `app/` and `components/` for `rooms.map(`, `classes.map(`, `matchedPeers.map(`, `classKcs.map(` without `asArray(` (null-crash guard) | not a security guard despite the name; four hard-coded identifiers |
| `check:models` (`scripts/check-no-hardcoded-models.mjs`) | no hardcoded Gemini model ids and no direct `models.generateContent` outside `lib/ai/`, scripts, tests | does not cover Groq/OpenRouter ids or other direct SDK calls |
| `test:acceptance` (`scripts/acceptance-b14.ts`) | pure-function invariants: model routing defaults, DAG cycle rejection, quality gate fail-closed, PCM to WAV, injection fencing, LaTeX-safe PII scrub | called "end-to-end" but touches no server, DB, browser or HTTP |

Gaps in the pipeline: no `next build` in CI (a build break only shows on Vercel); no dependency audit (`npm audit`, Dependabot config not seen); no secret scanning step; no Firestore rules test against the emulator; CI does not block Vercel deploys unless branch protection requires the check (Unknown, repo settings). `check:openrouter` and `scripts/smoke.ts`, `scripts/eval-tutor.ts` exist but are manual.

## 2. Test inventory

Totals: 232 test files; 338 API `route.ts` files, of which 22 have a route-level test file (6.5 percent); 7 test files under `components/`; no `.test.tsx` for pages. 58 test files use `vi.mock` (mocked Firestore/Admin), none use the Firebase emulator (grep for `emulator` returned nothing).

| Area | Test files | Source files | Notes |
|---|---|---|---|
| `lib/studio` (circuits, blockly, STL) | 18 | 46 | pure simulation logic, strong |
| `lib/ai` (router, groq, openrouter, voice, prompts, scrub, models) | 17 | 29 | fallback and quota-exhaustion paths covered in `router.test.ts` (22 cases), `router-openrouter.test.ts`, `groq-*.test.ts` |
| `lib/study` | 13 | n/a | |
| `lib/teacher` (class builder, ingest, orchestrator) | 11 | 18 | |
| `lib/worlds` | 9 | 21 | partial |
| `lib/pet` | 9 | n/a | |
| `lib/sim` (build/sanitize, inject, runtime3d) | 7 | 8 | sanitizer and CSP strings tested; no real-browser test of the sandbox |
| `lib/billing` | 5 | 9 | plus `app/api/billing/{checkout,verify,webhook}` route tests |
| `lib/auth` | 5 | 7 | `rules.test.ts` tests a re-implemented allowlist, not the rules file (misleading); `firestore-rules-file.test.ts` does static text checks of `firestore.rules` |
| `lib/security` | 3 | 2 | api-guard, cron, push worker CSP |
| `lib/quota` | 3 | 1 | `reservation.test.ts` includes a concurrency case (mocked store) |
| `lib/schools` | 2 | 3 | policy and standings; route test exists |
| `lib/bkt`, `lib/fsrs`, `lib/evidence`, `lib/adaptive`, `lib/kc`, `lib/learning`, `lib/mistakes`, `lib/exam`, `lib/quiz` | 2, 1, 1, 1, 1, 1, 1, 1, 1 | thin | core mastery math has one file each; mastery transaction (`lib/evidence/apply.ts`) has `apply.test.ts` |
| `lib/pdf`, `lib/documents`, `lib/snap` | 1, 2, 1 | | page-text and image parsing only |
| Libs with zero tests | `lib/gemini` (3 files), `lib/live` (2), `lib/media` (1), `lib/notebooks` (1), `lib/chat` (1), `lib/community` (2), `lib/notifications` (2), `lib/firebase` (2), `lib/validation` (2), `lib/cards`, `lib/client`, `lib/store`, `lib/testing`, `lib/ui`, `lib/types` | | `lib/gemini/client.ts` (structured JSON calls used by routes such as `classes/[id]/map`) and `lib/media/store.ts` (uploads) are the risky ones |
| API route tests | `admin/{autonomous,billing/people,broadcast}`, `auth/{bootstrap,restore,session}`, `billing/{checkout,verify,webhook}`, `classes`, `classes/[id]/past-questions`, `classes/[id]/read/signal`, `feed`, `profile/setup`, `quiz/[sessionId]/answer`, `referrals`, `route-guards`, `schools`, `stt`, `study/{evaluation,telemetry}`, `download/android` x2 | | |
| Components | `labs/tutor-bubble`, `lesson/find-block*`, `studio/export-stl`, `study/flipbook-notes`, `teach/blocks` | 307 `.tsx` in app+components | UI essentially untested |

By concern:
- Billing: webhook signature, amount, currency, replay are tested (route tests plus `lib/billing`). No test for refunds, partial payments, plan downgrade or expiry sweep. Verified by file names; case contents sampled only.
- Auth flows: bootstrap, session, restore have route tests; `requireUser` has no direct test file named for it (covered indirectly via `failures.test.ts`; Partially verified). Admin role elevation paths (`admin/users/[uid]`, `me/request-teacher`) untested.
- AI integrations: router fallback, quota exhaustion, provider failure are unit-tested with mocks; no contract tests against real providers (appropriate), `scripts/eval-tutor.ts` is manual.
- Firestore operations: 53 non-test files call `runTransaction`; 10 test files exercise a transaction, all against hand-written mocks. Real query semantics, composite indexes (`firestore.indexes.json`), and security rules are never executed in CI.
- Concurrency: only `lib/quota/reservation.test.ts` (reservation race), `guard.test.ts`; none for double-submit on quiz answers, enrollment, mastery updates, streak touch, join requests.
- Provider failure and quota exhaustion: covered in `lib/ai/router.test.ts` and `lib/ai/groq*.test.ts`; not covered for Paystack outage (verify route returns 502 path unknown), Firestore outage fallback of the shared limiter (logged fallback exists in `lib/rateLimit.ts`; no test seen).
- Integration, end-to-end, browser tests: none. No Playwright, Cypress or `*.spec.*` for the product (only third-party `.agent/` tests). `test:acceptance` is not E2E. No visual regression, no accessibility test, no load test.

## 3. High-risk areas with inadequate coverage

1. Firestore security rules: no emulator test, `lib/auth/rules.test.ts` is tautological. A rules regression (reads of `payments`-like data are fine today by default-deny) would ship unnoticed; `deploy-firestore.yml` auto-deploys on merge.
2. Authorization (IDOR): `route-guards.test.ts` proves a guard word exists, not that each ID-parameterised route checks ownership. 316 of 338 routes have no route test.
3. Sandbox for AI-generated HTML: strings tested, behaviour (sandbox attribute, message origin check, CSP effect) not tested in a browser; the `components/labs/*.tsx` iframes have no test asserting `sandbox` value.
4. Uploads: `lib/media/store.ts`, `app/api/uploads/image`, `explainers`, `documents/read`, `snap` handlers have no direct tests (only `snap/image.test.ts`, `stt` route test).
5. Mastery/evidence engine concurrency and idempotency (`lib/evidence/apply.ts`, quiz answer route): single-file tests, no replay/double-submit cases beyond what `quiz/[sessionId]/answer` covers.
6. School/principal portal: `app/api/schools/route.ts` is 609 lines, one route test; roster visibility, seat limits, cross-school join, `admin_grant_seats` need negative tests.
7. Rate-limit and proxy: `api-guard.test.ts` exists but no test of the bypass in finding S-02 (rotating credential keys), none of shared vs in-memory behaviour per route.
8. `lib/ai/router.ts` (1227 lines): single point of failure for cost, fallback and learner-DNA isolation; 22 test cases in `router.test.ts` plus 2 sibling files. Cache/DNA isolation rule (lines ~53-63) has a unit test only if present in `router.test.ts` (Unknown).
9. Data lifecycle (delete/export): feature does not exist, so no tests; needed before it ships.

## 4. Technical-debt register (input)

Effort: S under 2 days, M 2 to 7 days, L over 1 week. "Blocks features" means blocks new feature work or a launch milestone.

| # | Pri | Item | Affected files | Impact | Recommended fix | Effort | Depends on | Blocks features? |
|---|---|---|---|---|---|---|---|---|
| T1 | Critical | No account deletion/export, privacy notice or consent | `app/(auth)/*`, `app/(app)/settings`, new `app/api/me/*`, all user-keyed collections | Legal exposure, school sales blocker (NDPA) | Build erase and export pipeline keyed on uid across ~50 collections; add privacy/terms pages and consent at signup; legal review first | L | Legal input, data map (see security audit 5.1) | Yes: school/minor onboarding |
| T2 | Critical | Firestore rules untested in CI | `firestore.rules`, `lib/auth/rules.test.ts`, `.github/workflows/*` | Silent data exposure; auto-deploy of rules | Add `@firebase/rules-unit-testing` + emulator job; delete or rewrite the tautological test; make deploy workflow depend on it | M | CI emulator setup | No, but gates safe rules changes |
| T3 | High | Rate-limit bypass and in-memory limiter | `lib/security/api-guard.ts`, `proxy.ts`, `lib/rateLimit.ts`, ~140 route call sites | AI cost abuse, DoS | Verify credential or key by IP+UA hash before the signed-in bucket; make `shared: true` the default for any route that reaches AI/DB writes; add a global daily AI spend ceiling | M | none | No |
| T4 | High | AI spend gaps for teachers and free multi-accounts | `lib/quota/guard.ts` `budgetOf`, routes listed in security S-03 | Uncapped cost | Cap teachers even when billing is off; per-IP/device signup throttle; confirm each AI route passes `userId` | M | Product decision on teacher limits | No |
| T5 | High | Plaintext provider keys in Firestore | `lib/ai/api-key.ts`, `lib/ai/groq.ts`, `lib/ai/openrouter*.ts`, `secrets/*` | Key theft | Move to Secret Manager / env only, or envelope-encrypt with a KMS key | M | Infra access | No |
| T6 | High | Router monolith | `lib/ai/router.ts` (1227 lines), `lib/ai/*.ts` | Hard to change safely; central cost/safety logic | Split into pipeline stages (quota, cache, provider chain, parse) with per-stage tests; do not rewrite behaviour | L | More router tests first | No, but slows AI work |
| T7 | High | Guard test is regex-based | `app/api/route-guards.test.ts` | False assurance on authorization | Replace with a small route-wrapper (`withUser`, `withClassAccess`) and test the wrapper; add per-route negative tests for ID routes | L | none | No |
| T8 | High | No E2E / browser tests | whole app; sim iframe, auth, checkout return | Regressions in UI, sandbox, auth cookie flow undetected | Add Playwright smoke: sign-in (emulator), join class, run lab and assert sandbox attribute, plans page; run on PR | M | Firebase auth emulator | No |
| T9 | Medium | CSP `unsafe-inline`/`unsafe-eval` | `next.config.ts`, `app/layout.tsx` inline theme script | XSS blast radius | Move to nonce-based CSP via the proxy; drop `unsafe-eval` if Blockly/three/mermaid allow it; restrict `img-src` | M | Verify third-party libs | No |
| T10 | Medium | Prompt-injection controls uneven | 38 AI call sites vs `lib/ai/generate.ts`, `lib/study/topic-source.ts` | Content integrity; sim HTML generation from untrusted text | One helper that fences and scrubs by default inside `generateWithFallback` for fields marked `untrusted`; extend PII patterns (NIN, BVN, Nigerian phones, names) | M | none | No |
| T11 | Medium | Committed APKs | `public/sunroot-3.2.apk`, `public/sunroot-3.3.apk` | Repo bloat, policy violation | Remove from tree, attach to GitHub Releases per CLAUDE.md; consider history rewrite only if signing material is inside | S | Release process in `docs/RELEASING.md` | No |
| T12 | Medium | No retention policy/TTLs | `DEPLOY.md`, `errorLogs.expireAt`, chats, evidence, payments | Unbounded personal data | Define retention per collection; enable TTL on `expireAt`/`purgeAt`; document | S to M | Legal input | No |
| T13 | Medium | CI misses build, audit, secret scan | `.github/workflows/ci.yml` | Build/dependency/secret regressions | Add `next build` job (mock env), `npm audit --omit=dev`, gitleaks, Dependabot; pin `claude-code-security-review` to a SHA | S | none | No |
| T14 | Medium | Mocked-only Firestore tests | 58 test files with `vi.mock` | Mock drift; indexes/query errors found in prod | Introduce emulator-backed integration tests for mastery, quota, schools, billing transactions | M | T2 emulator setup | No |
| T15 | Medium | Untested upload/media paths | `lib/media/store.ts`, `app/api/uploads/image`, `explainers`, `documents/read`, `avatar`, `/api/media` | Bad bytes, cross-user media access | Unit tests with crafted payloads; per-owner or class-scoped ACL for `/api/media` | M | none | No |
| T16 | Medium | School portal size and policy | `app/api/schools/route.ts` (609 lines), `lib/schools/*` | Tenant leaks, seat abuse | Extract per-action handlers; add negative tests; restrict `create_school`/`public_register_school` abuse (verification, caps) | M | Product rules | Blocks school pilots at scale |
| T17 | Low | `lib/auth/rules.test.ts` and `check:guards` naming mislead | those files | Mistaken confidence | Rename (`check:null-guards`) or fix as in T2 | S | none | No |
| T18 | Low | Duplicated legacy brand names and dual bridge messages (`synapta`/`sunroot`) | `lib/sim/inject.ts`, labs, `acceptance-b14.ts` | Confusion; extra surface | Remove the `synapta-sim` alias after confirming no stored sims need it (stored HTML may call `window.synapta`; keep alias until regenerated) | S | Stored simulation migration | No |
| T19 | Low | Logout does not revoke refresh tokens | `app/api/auth/session` DELETE | Stolen cookie lives 14 days | Call `revokeRefreshTokens` on explicit "sign out everywhere" | S | none | No |
| T20 | Low | Refund/dispute handling absent | `app/api/billing/webhook`, `lib/billing/activate.ts` | Plans stay active after refunds | Handle `refund.processed` / `charge.dispute.*`, admin tool to revoke | S to M | Paystack config | No |
| T21 | Low | Cosmetic refactors | n/a | none measurable | Do not schedule; no measurable value | - | - | No |

## 5. Suggested order
T2 and T13 first (cheap, protect everything after), then T3/T4/T5 (cost and key risk), T1 in parallel with legal review, then T7/T8/T14 to raise assurance, T6 only when AI work needs it.

## Open questions
1. Is branch protection requiring the CI check before Vercel production deploys?
2. Do `lib/ai/router.test.ts` cases cover the DNA/cache isolation rule and quota-exhaustion across all provider tiers?
3. Is there any coverage figure or flaky-test history? (Not in repo.)
4. Are `scripts/smoke.ts` and `scripts/eval-tutor.ts` run anywhere on a schedule?
5. Which of the 22 route tests assert negative authorization (wrong user, wrong role), not just success paths? Only file names were checked.
6. Is a Dependabot or Renovate config present outside the tracked files read?
7. Does `next build` pass on `main` today? It was not run.
