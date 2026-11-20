# Business and unit economics audit (read-only)

Repo: shamzrepha/synapta (SunRootLearn). Audit date: 2026-11-19. Scope: subscription implementation, quota enforcement, per-plan unit economics, scale scenarios, recommended access model.
Method: code reading only (no builds, no calls to Paystack, AI or production). Nothing here is measured production data. **No revenue, conversion, traffic or token numbers exist in the repo or were provided; every volume below is an explicit assumption.** Another agent owns AI_INFRASTRUCTURE_AUDIT.md; this document is self-contained and states which numbers are mine.

Legend: Status = Verified (read in code) / Partially verified / Assumption / Unknown. Confidence = HIGH / MEDIUM / LOW / UNKNOWN.

---

## 1. Executive verdict (blunt)

1. **Student prices are sustainable only because a token cap sits above them; teacher prices are not.** On the default light model, Plus (₦3,500) and Pro (₦6,000) survive a maximum-usage user. Teacher (₦7,500) and Teacher Pro (₦15,000) lose money if the 15M / 40M token budgets are used, and the per-feature caps meant to protect them (`class_build`, `studio_ai`) are **never checked in code**.
2. **Right now (enforcement off) nothing in the plan limits is enforced, yet students can already pay.** A paying Plus student still has the 50,000-token default cap, because the plan's token budget only applies when billing is enforced (`lib/quota/guard.ts`, `budgetOf`). If payments are live with enforcement off, customers pay for almost nothing. Production state is Unknown.
3. **The Pro plan is missing the Past Question Solver.** `hasExamAccess` in `app/api/classes/[id]/past-questions/route.ts` allows only `plus`, `exam`, `teacher` (or teacher/admin role). A Pro student (₦6,000, the top student plan) is blocked after one free preview. Verified bug, direct churn and refund risk.
4. **Cost accounting understates real spend.** Thinking tokens are not counted (`candidatesTokenCount` only), the per-user cost estimate hard-codes old prices ($0.075/$0.30 per M vs today's $0.30/$2.50 for the default light model), and there is no global USD circuit breaker for Gemini (only OpenRouter has one, default $1.50/day).
5. **Gemini free tier cannot carry this product past a few hundred active students** (repo-documented caps of 500 requests/day per light model, 20/day per heavy model; Google also states free-tier content is used to improve its products, a privacy issue for student notes). A paid key is required well before 1,000 students.

---

## 2. Subscription implementation: what the code really does

### 2.1 Plans (lib/billing/plans.ts): Verified, HIGH

Prices in the brief were not trusted; these are read from `PLANS`:

| Plan | Audience | ₦/month | ₦/term | Tokens/month | Per-minute | notes | scan pages | lessons | practice | studio_ai | class_build |
|---|---|---|---|---|---|---|---|---|---|---|---|
| free | student | 0 | 0 | 100,000 (50,000 effective when enforcement off) | 10 | 3 | 15 | 5 | 5 | 3 | 0 |
| exam (Exam Pass, 30 days) | student | 1,500 | 5,000 | 600,000 | 20 | 3 | 50 | 20 | 100 | 3 | 0 |
| plus | student | 3,500 | 11,000 | 1,200,000 | 25 | 50 | 400 | 80 | 150 | 40 | 0 |
| pro | student | 6,000 | 19,000 | 3,000,000 | 30 | 150 | 1,000 | 250 | 250 | 120 | 0 |
| promax (retired) | student | 9,000 | 21,000 | 8,000,000 | 45 | 400 | 2,500 | 600 | 600 | 300 | 0 |
| ultra (retired) | student | 15,000 | 34,000 | 20,000,000 | 60 | unlimited | 6,000 | unlimited | unlimited | 1,000 | 0 |
| teacher | teacher | 7,500 | 20,000 | 15,000,000 | 60 | unlimited | 1,500 | unlimited | unlimited | 150 | 25 |
| teacherpro | teacher | 15,000 | 40,000 | 40,000,000 | 90 | unlimited | 4,000 | unlimited | unlimited | 400 | 80 |
| school | school | invoice | invoice | 15,000,000 | 60 | unlimited | 5,000 | unlimited | unlimited | 500 | 100 |

- School: `perSeatTermNgn` = ₦1,200 per student per semester, invoiced. `PAYABLE` excludes school. No code path was found that turns a school invoice into seat entitlements (the only route found is an admin plan grant to individual accounts). Status: Partially verified; how seats map to the `school` plan object is Unknown.
- Retired plans (`promax`, `ultra`) are hidden but holders keep them until expiry. Ultra has unlimited notes/lessons/practice bounded only by 20M tokens (about $19 of light-model AI at cap). Verify no holders remain.
- Exam Pass: ₦1,500 for 30 days (`MONTH_DAYS`); "term" ₦5,000 for 135 days.

### 2.2 Term and days: Verified, HIGH
- `TERM_DAYS = 135` (not 120 as the brief and the comment above `priceTermNgn` say; the Plus perk text says "4.5-month semester"). `MONTH_DAYS = 30`.
- Plus term ₦11,000 buys 135 days = ₦2,444 per 30 days (30% below monthly ₦3,500). `termSavingsPercent` compares against four months and shows 21%, understating the real 30% discount.
- Quotas reset on the **UTC calendar month** (`currentPeriod = ISO.slice(0,7)`), not on the subscription anniversary. A term buyer gets five full quota resets in 4.5 months; a monthly buyer paying on the 28th gets a full quota for three days, then a fresh one on the 1st. A heavy user can burn two allowances within days. Cost spike risk, LOW-MEDIUM.

### 2.3 Payment flow: Verified, HIGH
- `app/api/billing/checkout/route.ts`: requireUser, rate limit 6/min (non-shared, in-memory per instance), zod body, plan must be in `PAYABLE` and pass `canBuy` (teacher plans need teacher/admin role), email required, own reference `sr_<uid8>_<time>_<rand>`, Paystack initialise with amount from the server price table (`priceFor * 100`), currency NGN, all channels, metadata {uid, plan, term}. The client cannot set the price.
- `lib/billing/paystack.ts`: `verifySignature` = HMAC-SHA512 of the raw body, constant-time compare. `readTransaction` rejects non-success status, missing reference, non-string uid, plan not payable, invalid term, currency not NGN, amount below `priceFor(plan, term) * 100`. Overpayment is accepted silently (no credit or refund logic).
- `app/api/billing/webhook/route.ts`: 503 without secret, 401 on bad signature, only `charge.success` handled, then `activatePayment`.
- `app/api/billing/verify/route.ts`: after the Paystack redirect, the server calls Paystack verify with the secret key; rejects if the payment's uid differs from the caller; rate limit 10/min.
- `lib/billing/activate.ts`: Firestore transaction. **Idempotency**: the `payments/{reference}` document; if it exists the call returns false (webhook and verify race safely). Expiry: same plan stacks on the running expiry; a **different plan starts from now and the remaining days of the old plan are forfeited** (no proration, upgrade or downgrade).
- Gaps (Verified): (a) if the user doc does not exist, `activatePayment` returns false while the webhook still answers 200, so money is taken with no plan and no record; (b) charges failing `readCharge` (underpaid, wrong currency, unknown plan) are ignored with no log; (c) no pending-payment record at checkout, so no reconciliation of "initiated but never activated"; (d) refund, dispute and chargeback events are not handled.

### 2.4 Cancellation, refunds, renewal: Verified, HIGH
- **No recurring billing**: no Paystack subscription/plan codes, no stored authorization, no auto-renew. Every purchase is a one-off that extends expiry. "Cancellation" is moot (a plan lapses), which limits chargeback exposure but makes every renewal a manual conversion event; churn is structural.
- **No refund or chargeback code** (grep over app/ and lib/ found none). A refund or dispute leaves the plan active. The only removal is the admin tool (`app/api/admin/billing/people/route.ts` deletes plan fields). A published refund policy was not checked (Unknown).
- Expiry: `planOf` returns Free once `planExpiresAt <= now` (teachers fall back to a trial: Free limits + 2 class builds + 1M tokens; admins get Teacher limits).

### 2.5 Enforcement semantics, BILLING_ENFORCED: Verified, HIGH
- `lib/billing/config.ts`: with no saved `config/billing` document, `BILLING_ENFORCED=1` decides; unset means **off**. With a saved config the modes are off / testers / all. Docs (`PAYSTACK-SETUP.md`, `BUILD-THE-APP.md`) tell the operator to leave it unset; `PHASE0_FINDINGS.md` says currently Off.
- When **off**: `checkFeature` returns immediately (no per-feature limit anywhere); usage is still recorded (`featureUsage.<YYYY-MM>.<feature>`). Token cap: students get `STUDENT_DEFAULT_LIMIT = 50,000` tokens/month (or an admin-set `monthlyTokenLimit`) at 10 calls/minute; **teachers are uncapped** at 60 calls/minute; admins always uncapped. Paid plans add nothing to the token cap while off.
- When **on**: token limit = max(admin override or default, plan.monthlyTokens); per-minute = plan.perMinute; `checkFeature` blocks at the plan's per-feature limit.
- Not gated by the switch (always on): the Past Question Solver paywall (1 free preview, lifetime, via `pastQuestionAttempts`) and 3 community posts/day for Free (`app/api/feed/route.ts`). The paywalls that exist today are the ones that cannot be turned off, and one of them blocks the Pro plan.

### 2.6 Quota reservation and concurrency: Verified, HIGH
- `lib/quota/guard.ts`: AI calls via `generateWithFallback` run `reserveQuota` (Firestore transaction counting used + open reservations + estimate; heavy estimate 8,000, light 1,500; TTL 10 min), then `settleQuota` against real tokens or `releaseQuota` on failure/cached answer (idempotent). Concurrent requests cannot jointly overspend the **token** budget. The per-minute limit is a shared Firestore counter with an in-memory fallback.
- **Per-feature counters are not atomic**: `checkFeature` (read) then `recordFeature` (increment after success). Parallel requests can all pass. Bounded by non-shared route rate limits (6 to 30/min per serverless instance), so overshoot is limited; tokens still bound total cost.
- **`studio_ai` and `class_build` counters are never read or written** (grep finds `checkFeature`/`recordFeature` only for notes, scan_pages, lessons, practice). Studio and class-build routes have an 8/min rate limit and token reservation only. The plan table and the Teacher "25 class builds" promise are unenforceable today.
- Enforcement is server-side (good). The client UI only displays `GET /api/billing/me`.
- Usage tracking: `usage/{uid}_{period}` stores tokensIn/Out, calls and `estimatedCostUsd` at **hard-coded old prices** ($0.075/$0.30 per M). The per-day `aiSpend` document with a $1.50 default cap exists only for OpenRouter calls. No Gemini spend record exists in code.
- Token undercount: `usageMetadata.candidatesTokenCount` excludes thinking tokens (`thoughtsTokenCount` is never read; no `thinkingConfig` set), and falls back to 500/600 when metadata is absent. Gemini bills thinking as output, so real cost and use exceed what the quota sees. Status: Partially verified (depends on model behaviour); impact MEDIUM-HIGH on heavy models.

### 2.7 Admin grants, Exam Pass, referrals: Verified
- Admin grants (`people/route.ts`): any plan for N days with `planGrant{kind,by,at,note}`; the "test" kind resets usage. No cost cap or alert on grants. Teacher plans only to teacher/admin accounts (`planFitsRole`).
- Referral (`app/api/referrals/route.ts`): +250 XP each; at 10 referrals the referrer gets a 14-day Exam Pass (only when currently free/exam; paying users get nothing). Requires verified email on the claimer, one claim per account, 5/min rate limit, transactional. A ring of 10 verified free accounts earns the pass: worth at most about ₦400 of AI at cap on the light model. Cheap to give away, but farmable without any purchase. Self-referral blocked by uid and handle.
- Free-plan abuse in general: AI routes use `requireUser` (an account) but not `requireVerifiedEmail`; no CAPTCHA, App Check, device or IP signal was found. Mitigation is the per-account 50k/100k token cap plus per-minute limits. Each burner account yields up to about $0.05 to $0.10 of AI on the light model: 1,000 burners/month = $48 to $96; 20,000 = about $1,000 to $2,000. IP rate limiting uses the first `x-forwarded-for` entry, spoofable unless the proxy overwrites it (Unknown).

---

## 3. Provider prices used (official pages, accessed 2026-11-19)

| Item | Price used | Source |
|---|---|---|
| Paystack Nigeria local | 1.5% + ₦100; ₦100 waived under ₦2,500; fee capped at ₦2,000 | https://support.paystack.com/en/articles/2130306 (2026-11-19). paystack.com/ng/pricing returned 403 to the fetcher. Stamp duty on NGN transfers is separate (https://support.paystack.com/en/articles/7573314), not quantified: Unknown. A ₦2,500 chargeback fee is reported only by a third party: Unknown. |
| Gemini 3.5 Flash-Lite (default light model in `DEFAULT_MODEL_CONFIG`) | $0.30 in / $2.50 out per M tokens | https://aistudio.google.com/docs/pricing (2026-11-19) |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | same |
| Gemini 3.6 Flash (default heavy/build/grading) | $0.75 / $3.75 through 2026-12-31, then **$1.50 / $7.50** from 2027-01-01 | same |
| Firestore (Standard, us-central1) | $0.03 per 100k reads, $0.09 per 100k writes, about $0.15 per GiB-month; free 50k reads, 20k writes, 20k deletes per day, 1 GiB | https://cloud.google.com/firestore/pricing (via search, 2026-11-19); free quotas https://firebase.google.com/pricing |
| Firebase Storage | 5 GB free, 100 GB egress free (new buckets, US regions); legacy buckets $0.026/GB, $0.12/GB egress | https://firebase.google.com/pricing |
| Hetzner CX23 (2 vCPU, 4 GiB, 40 GB, 20 TB EU traffic) | about €5.99/month incl. IPv4 (Aug 2026 third-party benchmark: €5.99 = $7.01); founder's console: $6.49. Hetzner's page showed "from €5.49" for regular and did not list CX23; availability unconfirmed | https://www.hetzner.com/cloud/ plus search results; MEDIUM confidence |
| Cloudflare | Assumed Free plan, $0. Not re-verified | Assumption |
| Vercel | CLAUDE.md says Vercel auto-deploys main; SELF-HOSTING.md describes Hetzner. Which is production is Unknown; Vercel cost excluded | Unknown |
| OpenRouter models (deepseek-v4-flash $0.09/$0.18 etc.) | Repo claim in `docs/OPENROUTER.md`; **not verified**, not used in my numbers | Unknown |
| TTS | Edge neural voices free (unofficial, can be blocked from servers); fallback Kokoro $0.62 per M characters per repo doc (unverified); Gemini TTS price not fetched | Unknown |

**FX assumption: ₦1,400 per USD.** Searches found ₦1,355 to 1,370 in July/August 2026 and one undated ₦1,541 to 1,549; no dated November 2026 quote was found, so ₦1,400 is a round mid-case, not a market quote. Sensitivity in section 6.

---

## 4. Assumptions table (mine, not measured)

| # | Assumption | Value |
|---|---|---|
| A1 | FX | ₦1,400/USD |
| A2 | Light model blended cost (70% input / 30% output tokens) | $0.96 per M tokens (Gemini 3.5 Flash-Lite); 50/50 mix = $1.40/M |
| A3 | Heavy model blended | $1.65/M now; $3.30/M from 2027-01-01 (Gemini 3.6 Flash) |
| A4 | Share of tokens on heavy models | 0% base case; 20% stress case |
| A5 | Notes set | average 5k in + 3k out; maximum about 38k in (code limit `NOTE_SOURCE_MAX` 120k chars x1.25) + 4k out |
| A6 | Scanned page | about 1.5k tokens in (image + prompt) + 0.8k out, about $0.0025 light |
| A7 | Interactive lesson | up to 30,000 chars in (about 7.5k tokens, `app/api/teach/route.ts`) + about 4k out, about $0.012 light |
| A8 | Practice set | 3k in + 2.5k out, about $0.007 light |
| A9 | Maker Studio build | 3k in + 8k out; code-class tasks allow up to 16k out; about $0.032 heavy now, $0.06 at 16k out |
| A10 | Tutor message | 3k in (history, system, learner profile) + 0.4k out, about $0.002 |
| A11 | Class build (teacher) | 10 calls x (10k in + 5k out) on heavy, about $0.26 now, $0.52 in 2027; planning range $0.25 to $1.50 (LOW confidence: the real call graph was not traced) |
| A12 | Firestore per active student-month | light 2k reads + 300 writes; average 4.5k reads + 600 writes; heavy 15k reads + 2k writes (about ₦3 / ₦8 / ₦25) |
| A13 | Storage/egress per paying student | about 200 MB stored, about ₦7/month; egress inside free quota |
| A14 | TTS per paying student | mostly Edge (free); fallback podcast about $0.006 each; about ₦8/month average |
| A15 | Fixed hosting | Hetzner about $7 + Cloudflare $0 + domain, about $9/month, about ₦12,600; excludes Vercel (Unknown) |
| A16 | Scale scenarios | 50% of registered users active monthly; 4% of registered pay (70% Plus, 20% Pro, 10% Exam). Pure assumption, no data |

AI cost is taken from plan token caps (the binding limit, section 5.2) and cross-checked with per-feature costs (A5 to A10). The AI_INFRASTRUCTURE_AUDIT.md model may use different prompt sizes; where they differ, prefer measurements (section 9).

---

## 5. Unit economics

### 5.1 Net revenue per plan per 30 days (after Paystack; fee formula Verified)

| Plan | Paystack fee | Fee % | Net revenue per 30 days |
|---|---|---|---|
| Exam ₦1,500 (30 d) | ₦22.50 (flat waived) | 1.5% | ₦1,478 |
| Plus monthly ₦3,500 | ₦152.50 | 4.4% | ₦3,348 |
| Plus term ₦11,000 (135 d) | ₦265 | 2.4% | ₦2,386 |
| Pro monthly ₦6,000 | ₦190 | 3.2% | ₦5,810 |
| Pro term ₦19,000 | ₦385 | 2.0% | ₦4,137 |
| Teacher monthly ₦7,500 | ₦212.50 | 2.8% | ₦7,288 |
| Teacher term ₦20,000 | ₦400 | 2.0% | ₦4,356 |
| Teacher Pro monthly ₦15,000 | ₦325 | 2.2% | ₦14,675 |
| Teacher Pro term ₦40,000 | ₦700 | 1.75% | ₦8,733 |
| School per seat ₦1,200/semester | invoice, about ₦0 | | about ₦267 ($0.19) |

### 5.2 Maximum AI cost per plan if the token budget is fully used (plan limits as the ceiling)

Cost = monthly tokens x blended price x FX. Token caps bind before most per-feature limits (Plus: 50 notes + 400 scans + 80 lessons + 150 practice sets is about 3M tokens against a 1.2M cap).

| Plan | Token cap | Light, 70/30 | Light, 50/50 | Heavy now (all tokens) | Heavy from 2027 |
|---|---|---|---|---|---|
| Free | 100k (50k eff.) | ₦134 | ₦196 | ₦231 | ₦462 |
| Exam | 600k | ₦806 | ₦1,176 | ₦1,386 | ₦2,772 |
| Plus | 1.2M | ₦1,613 | ₦2,352 | ₦2,772 | ₦5,544 |
| Pro | 3M | ₦4,032 | ₦5,880 | ₦6,930 | ₦13,860 |
| Teacher | 15M | ₦20,160 | ₦29,400 | ₦34,650 | ₦69,300 |
| Teacher Pro | 40M | ₦53,760 | ₦78,400 | ₦92,400 | ₦184,800 |
| School | 15M per account | ₦20,160 | | | |

Against net revenue per 30 days:
- **Exam**: ₦806 to ₦1,176 vs ₦1,478. OK (20% to 45% margin at cap).
- **Plus**: ₦1,613 to ₦2,352 vs ₦3,348 monthly (margin 30% to 50% at cap) and vs ₦2,386 on term (about 0% to 32%). On heavy models Plus loses money at cap on term pricing.
- **Pro**: ₦4,032 to ₦5,880 vs ₦5,810 monthly (about 0% to 30%) and vs ₦4,137 on term (**breakeven to a ₦1,700 loss**). Pro on term is not safe at full cap.
- **Teacher / Teacher Pro**: token caps are about 10x too generous. Even on the cheapest model at 70/30 the cap costs ₦20,160 vs ₦7,288 revenue, and ₦53,760 vs ₦14,675. Add class builds (A11): 25 builds about $6 to $37 (₦9k to ₦52k); Teacher Pro 80 builds about $20 to $120 (₦28k to ₦168k). **Unsustainable if lecturers use what the plan advertises.** Realistic lecturer use (5 builds + 1M other tokens) is about ₦3k to ₦5k: profitable monthly, thin on term.
- **School**: ₦267/seat/month ($0.19) funds only about 200k tokens per seat per month on the light model, roughly the Free allowance. Seats must be pooled and capped near Free-plus, not given 15M tokens per account.

### 5.3 What an average paying student costs per month

Usage in tokens per month (light / average / heavy=cap): Plus 150k / 500k / 1.2M; Pro 400k / 1.2M / 3M; Exam 100k / 300k / 600k; Free 15k / 50k / 100k. Light model, 70/30, ₦1,400. Non-AI per student (Firestore ₦3/₦8/₦25; paying only: storage ₦7, TTS ₦8). Paystack fee on a monthly purchase.

| Plan | Light user | **Average user** | Heavy (cap) | Revenue (month / term per 30 d) | Gross margin at average |
|---|---|---|---|---|---|
| Free | ₦24 | **₦75** | ₦159 | 0 | negative, about ₦75 per active user |
| Exam | about ₦155 | **about ₦460** | about ₦880 | ₦1,500 | about 69% |
| Plus | about ₦375 | **about ₦850** | about ₦1,805 | ₦3,500 / ₦2,444 | monthly about 76%; term about 66% (cost about ₦757 with amortised fee) |
| Pro | about ₦746 | **about ₦1,826** | about ₦4,280 | ₦6,000 / ₦4,222 | monthly about 70%; term about 56% at average, about 0% at cap |

**Answer: an average paying Plus student costs about ₦0.85k a month (about $0.60); an average Pro student about ₦1.8k ($1.30), assuming the average user consumes about 40% of the token cap on a light model.** That 40% is an assumption, not data; section 9 replaces it.

### 5.4 Features with the highest marginal cost
1. **Class build, sim_build, Maker Studio builds** (heavy model, long structured or code output of 8k to 16k tokens). Studio and class-build counters are unenforced.
2. **Handwritten paper marking** (`grade_handwritten` in the past-questions route: image + grading, included in Exam Pass and Plus with no sub-quota). Cost per mark about ₦3 to ₦10 (assumption).
3. **Scanned pages** (Pro allows 1,000, about 2.3M tokens, consuming most of Pro's 3M budget on its own).
4. **Notes from very large sources** (up to about 38k input tokens per set; 50 maximum-size sets exceed Plus's whole 1.2M budget).
5. **Podcast/discussion scripts + TTS** (script generation plus synthesis; free Edge voice can be blocked from servers, falling back to paid TTS).
6. **Web-grounded research** (`research_answer`): Google Search grounding may be billed beyond free quotas. Not verified: Unknown.
7. Highest *volume* but low unit cost: tutor chat (about ₦2.7 per message; 400 messages = about ₦1,080).

### 5.5 Fixed and hidden costs
- Hosting about $9/month (A15). Break-even at the fixed level is about five monthly Plus subscribers, so hosting is not the problem; **AI cost and entitlement leakage are**.
- Firestore is cheap now (section 7). Per AI call the quota path costs about 8 reads and 5 writes (rate limit, reservation, settle, usage doc), about $0.000007 per call; noticeable only above roughly 1M AI calls/month.
- Invisible or underestimated: thinking tokens; stale per-user `estimatedCostUsd`; no budget cap on the paid Gemini key; Paystack 4.4% on monthly Plus; stamp duty; FX and bank leakage converting naira to a USD AI bill; school-seat token exposure; teachers uncapped while enforcement is off; chargebacks and refunds (no code path); support time.

### 5.6 Features that can be almost free (keep free)
Shared content made once and served to everyone (class lessons, podcasts, quizzes, simulations published by teachers), cached cohort past-question solutions (generated once, then reads), FSRS flashcard scheduling, quests, streaks, community (Free capped at 3 posts/day), leaderboards, mastery display, MCQ marking in code, Edge TTS while it works, embeddings. Marginal cost is a few Firestore reads.

---

## 6. Sensitivity analysis

AI cost in ₦ per month at cap (Plus 1.2M tokens / Pro 3M tokens, light model, 70/30), to compare with net term revenue (Plus ₦2,386, Pro ₦4,137):

| FX ₦/USD | AI price x0.5 | x1 (today) | x2 | x4 |
|---|---|---|---|---|
| 1,360 | 784 / 1,958 | 1,567 / 3,917 | 3,133 / 7,834 | 6,266 / 15,667 |
| 1,400 | 806 / 2,016 | **1,613 / 4,032** | 3,226 / 8,064 | 6,451 / 16,128 |
| 1,550 | 893 / 2,232 | 1,786 / 4,464 | 3,571 / 8,928 | 7,142 / 17,856 |
| 1,800 | 1,037 / 2,592 | 2,074 / 5,184 | 4,147 / 10,368 | 8,294 / 20,736 |

Reading it: (a) a 2x AI price rise (exactly what Gemini 3.6 Flash does on 2027-01-01 for the heavy tier) makes Plus and Pro **lose money at cap on term pricing**; (b) naira at ₦1,800 (+29%) raises costs by 29% while revenue is fixed in naira; Pro-at-cap on term already breaks even at about ₦1,360 to ₦1,425; (c) halving prices restores 50%+ margin at cap. Because average users sit near 40% of cap, average-user margin survives a 2x shock (Plus average ₦672 AI becomes ₦1,344 vs ₦2,386 revenue) but not a 4x shock combined with a weaker naira.

---

## 7. Scale scenarios (A16: 50% active, 4% paid, 70/20/10 Plus/Pro/Exam; monthly purchases, light model, ₦1,400)

| | 1,000 registered | 10,000 registered |
|---|---|---|
| Active | 500 | 5,000 |
| Paying | 40 (28 Plus, 8 Pro, 4 Exam) | 400 (280 / 80 / 40) |
| Free active AI cost (avg ₦75) | ₦34k | ₦345k |
| Paying variable cost (Plus ₦850, Pro ₦1,826, Exam ₦460 incl. fees) | about ₦40k | about ₦403k |
| Total variable | about ₦74k ($53) | about ₦748k ($534) |
| Revenue, monthly purchases | ₦152k ($109) | ₦1.52M ($1,086) |
| Revenue, term purchases (net per month) | about ₦108k | about ₦1.08M |
| Fixed hosting | about $9 | about $40 to $100 (a single CX23 is unlikely to suffice; unverified) |
| Firestore | within or near free quota | about $10 to $25 (about 22M reads + 3M writes) |
| Contribution after variable + fixed | about $40 to $55/month | about $430 to $620/month before staff, support, bad debt |
| Gemini free tier sufficient? | **No**: 500 active x a few calls/day is about 1,500+/day vs about 1,000 light requests/day in the repo's own free-tier table | No; paid key mandatory, with budget alerts |

Honest read: at 1,000 students the business covers its infrastructure and AI but cannot pay a salary; at 10,000 it is still small unless conversion exceeds 4% or ARPU rises. If real conversion is 1%, 10,000 registered users produce a loss (free AI about ₦345k plus fixed vs about ₦380k revenue). Free-tier AI is the dominant variable cost at low conversion. Burner abuse: 20,000 extra accounts each using the 50k cap is about $960/month, as costly as the whole legitimate business at 10,000 students, and nothing besides per-account caps limits mass signup.

Architecture choices that create avoidable spending:
- Free tier on a paid-priced model with no per-day cap and no account-quality gate.
- Per-user personalised generation where shared generation would do (the code already shares class content: extend that pattern).
- Per-user rate-limit and quota writes on Firestore for every AI call (cheap now, a transaction per call).
- Scans sent page-by-page to a vision LLM even for printed pages that on-device OCR could read for free.
- Retired Ultra/Promax plans still live for holders.
- No evidence of prompt or context caching in the quota path; tutor history is resent each turn (whether Gemini implicit caching applies: Unknown).

---

## 8. Recommended access model (all recommendations)

Principles: keep the free tier genuinely useful and cheap by design; meter by money, not arbitrary counts; make every paid benefit actually enforced.

**Must stay free:** everything teachers publish (lessons, podcasts, quizzes, simulations), the community, streaks, leaderboards, mastery view, the tutor with an honest daily allowance, flashcard reviews, 3 past-question solutions per month (instead of 1 lifetime; cached answers are nearly free), account export and deletion, accessibility and low-data modes.
**Never monetise:** student safety and reporting, access to a course the lecturer enrolled the student in, learner data export, anything that makes exam outcomes pay-to-win, accessibility, the ability to see one's own progress.
**Premium (personal, per-user AI):** uploads and scans, personal notes at scale, unlimited past-question solver and handwritten marking, studio builds, personalised podcasts.

**Plan shape (starting point; calibrate with section 9 data):**
- Free: 50k to 100k tokens/month with a daily cap of about 5k tokens, 3 notes, 15 scan pages, 3 past-question solutions per month; verified email required for personal-AI features.
- Exam Pass: keep ₦1,500; add per-day caps and a sub-limit on handwritten marking (for example 15/month); include Pro in access.
- Plus: keep ₦3,500; token budget **800k** (not 1.2M) unless measured averages show headroom; term at ₦11,000 only with that cap, or raise term to about ₦12,500.
- Pro: lower the cap to about 1.5M tokens (40% AI ratio on term) or raise term to about ₦24,000. Add the Past Question Solver (bug fix).
- Teacher: tokens near 2M and enforce `class_build` (consider 10/month) or sell class builds as packs (for example ₦1,500 per extra build). Teacher Pro: 80 builds at ₦15,000 only works if a build costs under about ₦120; otherwise 25 builds plus 5M tokens.
- School: ₦1,200/seat/semester funds about Free-level AI (about 200k tokens/seat/month, pooled). Raise to ₦1,800 to ₦2,500 per seat for any more, or pool a fixed token budget per department.
- Index naira prices to FX quarterly, since cost is in dollars.

**Maximum sustainable AI per plan** (rule: AI at cap at most 40% of net term revenue per 30 days; light model, ₦1,400, $0.96/M): Exam about 440k tokens, Plus about 710k, Pro about 1.2M, Teacher about 1.3M, Teacher Pro about 2.6M. Halve these if over half of tokens go to a heavy model; quarter them after January 2027 if heavy-only.

**Stricter quotas needed (priority order):**
1. Enforce `class_build` and `studio_ai` (add `checkFeature`/`recordFeature` to studio, labs and class-build routes).
2. Sub-quotas on `grade_handwritten`, `sim_build`, `research_answer` and podcast generation.
3. Daily token and per-day scan limits (month-boundary spikes).
4. Notes source size by plan (for example 30k chars Free, 60k Plus, 120k Pro).
5. Atomic per-feature counters (check and increment in one transaction, or reserve then confirm).
6. A global daily USD kill-switch for Gemini like the OpenRouter cap, plus a Google Cloud budget alert.
7. Count thinking tokens (`thoughtsTokenCount`) or limit thinking on light tasks; update `estimatedCostUsd` to current prices.
8. Apply a paid plan's token budget even while enforcement is off (or enforce at the moment payments go live).
9. Burner defence: verified email before AI, signup rate limits per IP/device, referral-ring detection.

**Commercial/process fixes:** handle refund/dispute events (revoke or flag), log unmatched or underpaid charges, record pending checkouts for reconciliation, prorate or warn before a different-plan purchase wipes remaining days, add a recurring option (Paystack subscriptions) once retention is measured, publish a refund policy.

---

## 9. Measurement plan: events and counters to replace the estimates

Per AI call (extend `usage/{uid}_{period}` and an `aiSpend`-style daily document to Gemini):
1. `ai_call`: uid, plan id, task key, model id, provider, tokensIn, tokensOut, **thinkingTokens**, cached tokens, latency, success/fallback, USD at configured price, feature key, request size (chars/images).
2. Daily aggregates: USD by provider, task, model and plan; p50/p90/p99 USD per user per month by plan.
3. `feature_used` per feature per user per period (counted today for 4 of 6; add studio_ai, class_build, grade_handwritten, sim_build, podcast, research, TTS characters).
4. `quota_block`: QUOTA_EXCEEDED / PLAN_LIMIT / RATE_LIMITED by plan and feature (sizes cap-hit and upsell demand).
5. Billing funnel: `plan_view`, `checkout_started`, `payment_success`, `payment_ignored` (invalid charge), `verify_poll`, activation delay (webhook vs verify), plan, term, channel, amount, actual Paystack fee from settlement data.
6. Lifecycle: signups, verified-email rate, D1/D7/D30 activity, DAU/WAU/MAU, free-to-paid conversion by days since signup, renewal rate by plan and term (second payment within 7 days of expiry), lapse cohorts, refunds and chargebacks.
7. Abuse: signups per IP/ASN/day, free accounts at 90% or more of cap, accounts with AI use but no other activity, referral graph clusters, referral claims within minutes of signup.
8. Infrastructure: Firestore reads/writes per route (Cloud Monitoring), storage GB and egress GB, server CPU/RAM/p95 latency, Edge-TTS failure rate and fallback character counts, Cloudflare cache hit ratio.
9. Weekly job: reconcile Paystack transactions (API list) against `payments`, flag money received without a plan.
10. Headline KPIs: cost per paying user-month and per active free user-month, margin by plan and cohort.

Decision gate: once at least 200 paying user-months exist, re-derive table 5.3 from real distributions and reset token caps to P90 usage x 1.3.

---

## 10. Findings register

| # | Finding | Evidence | Status | Impact | Recommendation | Conf. |
|---|---|---|---|---|---|---|
| F1 | Pro plan lacks Past Question access | `hasExamAccess` in `app/api/classes/[id]/past-questions/route.ts` lists plus, exam, teacher only | Verified | Top student plan fails a headline feature | Grant to every paid plan | HIGH |
| F2 | Paid benefits not delivered while enforcement is off | `budgetOf` in `lib/quota/guard.ts`; `checkFeature` early return in `lib/billing/usage.ts` | Verified | Plus pays ₦3,500 for 50k tokens | Apply paid budget regardless of switch | HIGH |
| F3 | `studio_ai` and `class_build` limits unenforced | only notes/scan_pages/lessons/practice call `checkFeature` | Verified | Teacher plans bounded only by tokens | Enforce | HIGH |
| F4 | Teacher/Teacher Pro token caps (15M/40M) exceed revenue | section 5.2 | Code verified, cost estimated | Loss at heavy use | Cap tokens and builds | HIGH (code) / MEDIUM (cost) |
| F5 | TERM_DAYS=135 vs 120 in docs; real term discount 30% vs 21% shown | `lib/billing/plans.ts` | Verified | Pricing confusion | Align text | HIGH |
| F6 | No refund/dispute/cancel handling; different-plan purchase forfeits remaining days | `lib/billing/activate.ts`; grep | Verified | Disputes leave plan active; upgrades wipe days | Add handlers/proration | HIGH |
| F7 | Thinking tokens uncounted; stale cost constants | `lib/ai/router.ts` usageMetadata; `applyUsage` in `lib/quota/guard.ts` | Verified / Partial | Cost and quota understated | Fix | MEDIUM |
| F8 | No Gemini global spend cap | only `lib/ai/openrouter-spend.ts` has one | Verified | Runaway bill | Cap + alert | HIGH |
| F9 | Heavy Gemini price doubles 2027-01-01 | Google pricing page | Verified | Margin shock | Reprice or reroute | HIGH |
| F10 | Free-tier Gemini quotas insufficient; content used to improve products | `KNOWN_MODELS` rpd in `lib/ai/models.ts`; Google pricing page | Partially verified | Cap hit near 300 MAU; privacy | Paid key | MEDIUM |
| F11 | Per-feature counters non-atomic; non-shared route rate limits | `checkFeature`/`recordFeature`; `checkRateLimit` without `shared` | Verified | Small overshoot | Atomic counters | MEDIUM |
| F12 | Payment edge cases silent (missing user doc, invalid-but-paid charge) | `activatePayment`, `readCharge` | Verified | Lost-payment support cases | Log and reconcile | HIGH |
| F13 | School seat price too low for per-seat AI | section 5.2 | Estimated | Loss per seat | Reprice or pool | MEDIUM |

---

## Open questions

1. Is `BILLING_ENFORCED` / `config/billing` off in production, and are Paystack payments live? (Decides whether F2 hurts real customers.)
2. Which model actually serves each task in production (Gemini, OpenRouter, Groq), on a paid or free Gemini key?
3. Is production on Vercel or the Hetzner CX23 self-host? Vercel costs are not in these numbers.
4. How does a school invoice become entitlements (which accounts hold the `school` plan; are seats pooled)?
5. How many holders of retired `promax`/`ultra` or admin-granted plans exist, and at what cost?
6. Real token cost of a class build, `grade_handwritten`, `sim_build` and podcast generation (call graphs not traced).
7. Real conversion, activity, retention and renewal rates (none available).
8. Stamp duty and chargeback fee treatment by Paystack at these amounts; FX leakage when paying the AI bill in USD.
9. What is the published refund policy and who handles disputes?
10. Are thinking tokens enabled by default on the configured Gemini models (affects the undercount)?
