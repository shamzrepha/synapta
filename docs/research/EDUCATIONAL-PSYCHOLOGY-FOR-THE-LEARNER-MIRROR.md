# Educational psychology for the Learner Mirror and teacher match

Status: research and design proposal. Nothing here is built. Written 2026-11-21 against the repo as in this branch.

**Evidence labels.** Strong = several meta-analyses or large preregistered trials agree. Moderate = replicated but effects are small or conditional. Emerging = promising, few good trials. Contested = credible researchers disagree. Hypothesis = my inference, not tested.

**Source honesty (read this).** Many publisher and PubMed pages returned cookie walls or HTTP 403 to my fetch tool, and Europe PMC returned 503. What I could actually read on 2026-11-21 was the Crossref record or a search summary, listed below as "read". Everything else is cited from my knowledge of the literature with its DOI and is marked "recalled, not re-read today". Numbers marked (recalled) must be checked against the paper before they are quoted to schools or in marketing.

Read today (access date 2026-11-21):
- Pashler, McDaniel, Rohrer, Bjork (2008), Psychological Science in the Public Interest, https://doi.org/10.1111/j.1539-6053.2009.01038.x (Crossref abstract).
- Sisk, Burgoyne, Sun, Butler, Macnamara (2018), Psychological Science, https://doi.org/10.1177/0956797617739704 (Crossref abstract: 273 studies, N=365,915 for the mindset-achievement link; 43 studies, N=57,155 for interventions; both weak overall; possibly larger for low-income or at-risk students).
- Roorda, Koomen, Spilt, Oort (2011), Review of Educational Research, https://doi.org/10.3102/0034654311421793 (Crossref: 99 studies; engagement links medium to large, achievement links small to medium; some survive bias correction; stronger in higher grades).
- Dunlosky, Rawson, Marsh, Nathan, Willingham (2013), Psychological Science in the Public Interest, https://doi.org/10.1177/1529100612453266 (practice testing and distributed practice high utility; interleaving, self-explanation, elaborative interrogation moderate; highlighting and rereading low).
- Hattie and Timperley (2007), Review of Educational Research, https://doi.org/10.3102/003465430298487 (feedback can help or harm; type and delivery decide).
- Norcross and Lambert (2018), Psychotherapy 55(4), https://pubmed.ncbi.nlm.nih.gov/30335448/ (search summary: alliance r about 0.28, d about 0.57, 306 studies; I did not get matching effect sizes).
- Nigeria Data Protection Act 2023 s.31 and s.65 via secondary commentary from a web search (child = under 18 per the Child's Rights Act; parent or guardian consent; age verification; s.31(5) lets the NDPC regulate for 13 and over). The gazetted text and the NDPC GAID of 20 March 2025 (https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf) were NOT read. This is not legal advice. The repo's `docs/product-intelligence/SECURITY_AND_PRIVACY_AUDIT.md` section 5.5 flags the same gap.

Fetch failed (recalled only): Yeager et al. 2019 Nature (https://doi.org/10.1038/s41586-019-1466-y), Poropat 2009 (https://doi.org/10.1037/a0014996), Credé, Tynan, Harms 2017 (https://doi.org/10.1037/pspp0000102), Gollwitzer and Sheeran 2006 (https://doi.org/10.1016/S0065-2601(06)38002-1), Ryan and Deci 2000 (https://doi.org/10.1037/0003-066X.55.1.68), von der Embse et al. 2018 (test anxiety meta-analysis), Rowland 2014 (testing effect), Kalyuga 2003 (expertise reversal), Cepeda 2006 (spacing), Zimmerman 2002.

---

## 1. Executive summary for the founder

**The aim as stated ("a therapist who diagnoses how you learn and recommends the teacher who fits") is half sound and half dangerous.**

**What is solid (build on it):**
- Behaviour beats labels. What helps most is how a learner studies (retrieval practice, spacing, feedback, planning, calibrated self-checking) and what they already know, not who they "are". Practice testing and spacing are the best-supported study techniques (Dunlosky 2013), and the app already schedules reviews (FSRS) and tracks mastery (BKT).
- Prior knowledge is the one learner characteristic with a reliable teaching interaction: novices need worked examples and small steps; experts are slowed by them (expertise reversal). The app has `pL` per topic, so this needs no questionnaire.
- Metacognition: learners are often poorly calibrated (confidence not matching correctness) and prompting a comparison helps. The Mirror already collects confidence 1 to 5.
- Implementation intentions ("if it is 7pm, I open flashcards") help follow-through at small to medium size (Gollwitzer and Sheeran 2006, recalled). Effects in sustained academic habits are smaller.
- A good teacher-student relationship is associated with engagement and, more weakly, achievement (Roorda 2011, correlational).

**What is myth (never ship as a claim):**
- **Learning styles.** Matching teaching to a visual, auditory or kinaesthetic "style" is not supported. Pashler 2008: people have preferences and differing abilities, but there is no adequate evidence of the matching interaction.
- **Repo warning:** `lib/learning/telemetry.ts` defines "cohorts" (Micro-Step, Visual and Analogy, Worked Examples, First Principles) and `LearnerDna` exposes `dominantCohort` and `cohortLabel`. They are teaching scaffolds, not styles, but wording like "your cohort" invites the myth. Reframe as "what is helping you on this topic" driven by struggle and prior knowledge.
- Personality typing (MBTI and similar) as a basis for advice or pairing.
- A single "grit" or "growth mindset" score as a lever. Both are oversold.

**What is risky:**
- The word "diagnosis". Users, parents and regulators will read it as clinical. Use "study habits".
- Teacher match built on personality or ratings alone: weak evidence it improves learning, real bias risk (popular, lenient teachers win), and a risk of steering students away from required classes.
- Inferring anxiety or distress from behaviour and acting as a counsellor. Signpost only.
- Minors: under the NDPA a child is under 18 and needs parent or guardian consent (secondary source; verify). Your audience likely includes secondary students.

**Therapy analogue, honestly:** the matching literature does not support "pair by type". The alliance (agreement on goals, tasks, bond) predicts outcome (r about 0.28 in therapy), and the matching that helps is narrow: accommodating stated client preferences, language and culture, a few explicit characteristics. So match on stated needs and practical fit, and measure alliance-like feedback, not hidden traits. Therapy evidence does not transfer automatically to teaching: treat it as an analogy.

---

## 2. Evidence table

Strength refers to the claim in column 2, not the whole field. "Free" measures come from events the app already records.

| Construct | What it predicts | Strength | Cheap, ethical measure in app | Sources |
|---|---|---|---|---|
| Retrieval practice | Better delayed retention than rereading | Strong | Schedule it; log quiz vs reread share | Dunlosky 2013 (read); Rowland 2014 (recalled) |
| Spaced practice | Better long-term retention | Strong | FSRS logs (exist) | Dunlosky 2013 (read); Cepeda 2006 (recalled) |
| Interleaving | Discrimination and transfer in maths and categories | Moderate | Mixed-topic sets | Dunlosky 2013 (read) |
| Prior knowledge | Strongest learner predictor; moderates instruction | Strong | BKT `pL` per kc | Hattie, Visible Learning 2009 (recalled); Kalyuga 2003 (recalled) |
| Cognitive load, worked examples, expertise reversal | Novices gain from worked examples; guidance hurts experts | Strong (worked example), Moderate (reversal) | `pL`, hint use, time vs expected | Sweller; Kalyuga 2003 (recalled) |
| Learning styles (VAK etc.) | Style-matched teaching improves learning | **Myth, not supported** | Do not measure | Pashler 2008 (read) |
| Study-habit preferences | Learners have preferences, sometimes for less effective methods | Moderate | Mirror format affinity (exists) | Pashler 2008; Dunlosky 2013 |
| Self-regulated learning (plan, monitor, reflect) | Achievement; trainable | Moderate | Plan set vs done, review adherence, reflection prompt completion | Zimmerman 2002 (recalled); Dignath and Büttner 2008 (recalled) |
| Metacognitive calibration | Better calibration, more efficient study; overconfidence is common | Moderate | Confidence 1-5 vs correct | Dunlosky and Rawson 2012 (recalled); Mirror `confidence` signal |
| Self-determination (autonomy, competence, relatedness) | Intrinsic motivation, persistence; autonomy-supportive teaching helps | Moderate (mostly correlational, Western samples) | Optional item; choice usage | Ryan and Deci 2000 (recalled) |
| Achievement goals | Mastery goals relate to deeper strategies; performance-avoid to worse outcomes | Moderate, small effects | Optional item | Elliot et al. (recalled) |
| Growth mindset | Weak link to achievement; interventions weak overall, larger for low-income or struggling students | **Contested** | Do not score users | Sisk 2018 (read); Yeager 2019 (recalled: small GPA gain for lower achievers in a US national sample) |
| Test anxiety | Negative association with performance; some interventions help | Moderate; measurement varies | One self-report item; low-stakes practice | von der Embse 2018 (recalled); Ramirez and Beilock 2011 (recalled; replication mixed) |
| Big Five, conscientiousness | Conscientiousness predicts achievement (r about 0.2 recalled) | Moderate for prediction, **not for instruction or matching** | Do not collect | Poropat 2009 (recalled) |
| Grit | Little beyond conscientiousness | **Contested / weak** | Do not use; use observed retries | Credé et al. 2017 (recalled) |
| Procrastination, implementation intentions | If-then plans raise follow-through | Moderate | Plan creation and adherence | Gollwitzer and Sheeran 2006 (recalled) |
| Feedback | Task and process feedback beat praise; some feedback harms | Moderate to Strong, heterogeneous | Which feedback preceded improvement | Hattie and Timperley 2007 (read) |
| Deliberate practice | Skill gain with focused feedback-rich practice; "10,000 hours" version overclaims | Contested (strong form) | Not a profile field | Ericsson 1993; Macnamara et al. 2014 (recalled) |
| Sleep, time of day | Sleep loss harms attention and memory; personalised chronotype advice weakly supported | Moderate (sleep), Emerging (chronotype) | Best hours descriptive only | recalled; no strong source verified |
| Teacher-student relationship | Associated with engagement (medium to large), achievement (small to medium) | Moderate, correlational | Short satisfaction check | Roorda 2011 (read) |
| Teaching style x learner trait (ATI) | Few replicable interactions; prior knowledge is the robust one | Weak overall | Claim nothing beyond prior knowledge | Cronbach and Snow 1977 (recalled); Pashler 2008 (read) |
| Therapeutic alliance | Predicts outcome r about 0.28, d about 0.57 | Strong in therapy; analogue only here | 3-item per-class check | Norcross and Lambert 2018 (read, summary) |
| Client-therapist matching | Accommodating preference, language, culture helps modestly; type matching little support | Moderate (preference) | Ask and honour | Norcross and Wampold 2019 (not read; recalled) |
| Nigerian context | Large classes, language of instruction, exam-driven (WAEC, JAMB), device and data limits | I found no verified Nigerian trials for these interventions; treat every effect size as locally unverified | Short sessions, offline tolerance, language preference | none verified |

---

## 3. Recommended "Study profile" model

Name it "Study profile: how you study and what is helping", never "who you are". It lives inside `learnerMirror/{uid}` and keeps the Mirror's opt-in, decay, owner-only access, edit, reset and delete.

### 3a. Dimensions inferred from behaviour (no questions)
Each shows "still learning" until enough data, as the Mirror already does (`n/(n+5)`).

| Dimension | Inferred from | Output |
|---|---|---|
| Prior knowledge per topic | BKT `pL` (`lib/bkt`) | Worked example first (low) or mixed practice (high) |
| Calibration gap | `confidence` vs correctness, per topic and overall | "You rated 4/5 and got 2 of 5." Never "overconfident person" |
| Persistence | retries after wrong, `skip`, `too_hard` | "You retried 8 times this week" |
| Help-seeking | `hint` rate vs `pL` | Sprout hint pacing (`hintSpeed` exists) |
| Pace | dwell vs expected (exists) | Chunk size, example length |
| Schedule consistency | active days in last 14, start-hour spread | If-then plan prompt when low; best hours descriptive |
| Retrieval share | quizzes and flashcards vs reading minutes | Nudge to retrieval when reading dominates |
| Review adherence | FSRS due items done within 2 days | Spacing coaching |
| Format affinity | existing Mirror | Preference only; never claimed as more effective |

### 3b. Optional 2-minute check-in (learner chooses; skippable; stored as editable `you_set`)
Rule: write our own plain items. Constructs are free; items are copyrighted. Do not copy MSLQ, Grit-S, BFI, CTAS or SDT items. Licensing to verify before adopting any published scale (none verified today): MSLQ is commonly described as free for non-commercial research (a product is commercial, ask); the SDT site posts needs-satisfaction scales for research (check commercial terms); the Cognitive Test Anxiety Scale is copyrighted; BFI-2 is free for non-commercial research. Label ours "not a validated test", pilot wording and reading level in English and Pidgin before using results for more than tips.

Candidate items (5-point, "this week"):
1. Planning: "I decided when I would study."
2. Test nerves (one item): "Before a test my nerves get in the way." Only changes practice-test framing.
3. Autonomy: "I get to choose how I study."
4. Goal focus: "I study to understand, not only to pass."
5. Preferred language of explanation (a stated need, not a trait).
6. Preferred support style from a teacher (pace, feedback, language, availability), used in teacher match only with separate consent.

Do not ask: personality, grit, mindset score, mental health, home situation, anything clinical.

### 3c. What NOT to claim
- Never "learning style", "you are a visual learner", cohort names as identity.
- Never personality types as fact; never Big Five scores.
- Never "diagnosis", "anxiety level", "depression", "ADHD", "dyslexia", "disorder", "low ability". The Mirror summary already rejects labelling words: extend the blocklist and add a test.
- Never show the profile to teachers by default (Mirror is not teacher-visible today: keep).
- Every inference shows its evidence ("because you retried 8 times") with edit and delete.

---

## 4. Interventions the app can deliver, by dimension

| Dimension | Intervention | Evidence | Notes |
|---|---|---|---|
| Low prior knowledge | Worked example then faded problems; Sprout micro-steps | Strong | Existing `worked_example_first` scaffold: drive by `pL`, not "cohort" |
| High prior knowledge | Skip basics; retrieval and mixed problems; fewer hints | Moderate | expertise reversal |
| Overload (many hints, long dwell, `too_hard`) | Chunk lessons, one idea per screen, drop decoration | Strong principle; app-level effect is a hypothesis | |
| Review lapses | Spaced retrieval, small daily goal (exists) | Strong | |
| Reading-heavy study | "Close the page, recall three points" | Strong | |
| Calibration gap | Confidence-before-answer prompt then show comparison | Moderate | No shaming |
| Inconsistent schedule | Weekly if-then plan prompt, accept or dismiss | Moderate | Measure adherence |
| Self-rated test nerves | Frame practice tests as low-stakes; untimed mode; short reappraisal tip | Moderate to Contested | Not therapy; section 7 for distress |
| Low autonomy | Real choice among equal options; give the reason for tasks | Moderate | Free |
| Low sense of competence | Visible mastery progress, achievable next step | Moderate | Gold only for rewards (design system) |
| Feedback | Process-level feedback ("check the units"), not praise; set in AI task prompts in `lib/ai/tasks.ts` | Moderate to Strong | |
| Mindset messages | One-time "struggle is how learning works" copy; do not score or claim | Contested | Optional |
| Time of day | Descriptive "you do well around 7pm" only if data supports | Emerging | No health claims |

---

## 5. Teacher match design

### 5a. What exists today
- **Mentors** (`app/api/mentors/{profile,matches,requests}`, `lib/mentors/matching.ts`, `lib/mentors/server.ts`): peer mentors; `scoreMatch` = 10 per shared subject + 4 per shared availability slot + level-gap bonus; returns `reasons`. Collections `mentorProfiles`, `mentorRequests` (with checkins).
- **Tutors** (`app/api/tutors/{route,profile,requests}`, `lib/tutors/rules.ts`): peer Q and A with ratings, XP, Bayesian `tutorScore`. Collection `tutorProfiles` (subjects, bio, availability text, `answered`, `ratingSum`, `ratingCount`).
- **Lecturers**: class owners (`lib/classes/*`). There is no teacher profile today.

"Teacher" is three objects with three goals. Recommendation: start with mentor and tutor match (voluntary, peer) plus a descriptive lecturer "approach card" with no ranking (open question 1).

### 5b. Profile contents (extend, do not replace)
Declared (teacher edits, students see):
- approach as a checklist of observable practices, not types: "starts with worked examples", "weekly low-stakes quizzes", "written feedback within N days", "explains in English / Yoruba / Hausa / Igbo / Pidgin".
- pace (slow, moderate, fast), feedback style (short, detailed written, in person), languages, availability (reuse `AVAILABILITY_SLOTS`), subjects and level (exist).

Measured (server-computed, shown as ranges with n, never as a rank):
- cohort quiz difficulty (share correct), median lesson-to-publish time and cadence (`lib/classes/published.ts`),
- mastery gain per topic (BKT `pL` change, adjusted for entry mastery), delayed retention (FSRS), response time to questions; for tutors the existing rated-answer score.

Raw means are confounded by cohort difficulty: use entry-adjusted gain, hide anything under n=15 (placeholder), say "associated with", never "better teacher".

### 5c. Transparent match score
Additive, inspectable, in the style of `scoreMatch`:

```
fit = 0.35 need-fit + 0.25 practical-fit + 0.20 evidence-fit + 0.20 stated-preference
need-fit       topics where learner is weak (BKT) vs teacher's topic strengths
practical-fit  language, availability overlap, level
evidence-fit   teacher's adjusted mastery gain on those topics, shrunk to the mean (as tutorScore does)
preference     only things the learner set themselves (pace, feedback, language)
```
Weights are placeholders (hypothesis); tune by experiment. Hard filters: subject, level. Show top 3 with 2 to 3 plain reasons.

### 5d. What to avoid
- No personality or "type" matching.
- No hidden demographic features (gender, ethnicity, state of origin, school type). Language and stated preference only, user-set.
- Rating bias: popularity and lenience inflate ratings; use shrinkage, outcome measures, minimum n, show counts.
- No lecturer leaderboard (rewards easy grading).
- Never hide or replace a required class or lecturer. Match is for optional support (mentor, tutor, study group). The enrolled class always stays first.
- Exposure fairness: reserve 10 to 20 percent of slots for exploration so new teachers are seen.

### 5e. Control and "why this teacher"
Every suggestion lists reasons and inputs used. One tap "Don't use my study profile" falls back to subject, level, availability. Student can dismiss, report, view and edit inputs. Teachers see only aggregates ("your approach fits N students"), never a student's profile. Using the Mirror for match is a new purpose: separate opt-in.

### 5f. Cold start
New teacher: declared fields only, "New" label, exploration slots, stats shrunk to the platform mean. New student: subject, level, availability, language; ask the check-in only if they want better suggestions.

### 5g. Evaluation
Randomise opted-in students seeking support. Control = current `findMatches`; treatment = fit score. Primary: mastery gain per hour on the matched subject at 4 to 6 weeks, retention at 7 to 14 days (definitions in `docs/design/LEARNER-MIRROR.md`). Secondary: acceptance, repeat contact, a 3-item alliance check ("we agree on goals", "the approach suits me", "I feel respected"). Guardrails: required-class attendance, report rate, outcomes by device type, language and school, exposure share of new teachers. Pre-register the minimum effect. My expectation (hypothesis): most gain will come from practical fit, not the study profile.

### 5h. Mapping to code (extend existing collections first)

| Need | File | Change |
|---|---|---|
| Declared fields on mentors | `app/api/mentors/profile/route.ts` (zod `schema`, GET and PUT), `mentorProfiles` | Optional `approach: string[]` (fixed enum), `pace`, `feedbackStyle`, `languages: string[]` |
| Same for tutors | `app/api/tutors/profile/route.ts`, `lib/tutors/rules.ts` (`TUTOR_LIMITS`), `tutorProfiles` | Same optional fields |
| Lecturer approach card | new `teacherCards/{uid}`; owner from `lib/classes/members.ts`; new route `app/api/teachers/card` | Do not reuse `mentorProfiles` for lecturers |
| Pure scoring | `lib/mentors/matching.ts` (`MentorProfile`, `scoreMatch`, `findMatches`), `matching.test.ts` | Add optional fit terms, keep old score as control arm |
| Hydration | `lib/mentors/server.ts` `toMentorProfile` | Map new fields |
| Candidates and reasons | `app/api/mentors/matches/route.ts` (`limit(300)` on `mentorProfiles`) | `useStudyProfile` flag; return reasons |
| Student inputs | `lib/mirror/schema.ts`, `profile.ts`, `store.ts` (`learnerMirror/{uid}`) | `stated: {language, pace, feedbackStyle, supportConsent}` as `you_set`; calibration gap and retrieval share in `profile.ts` |
| Teacher stats | server job over `lib/bkt`, FSRS logs, `lib/classes/published.ts`; `teacherStats/{uid}` | Aggregates only, no student ids |
| Deletion | `lib/privacy/delete-user.ts` and its test | Include new fields |
| Guards | `app/api/route-guards.test.ts` | New routes need `requireUser`, zod, rate limit |
| A/B | `lib/experiments` (not read in detail) | Assignment |
| Copy | `docs/design/DESIGN-SYSTEM.md` | brand blue; gold only for rewards |

---

## 6. Phased plan, cost, privacy checklist, measurement

**Phase 0 (2 days): framing.** Rename "cohort" surfaces to scaffold-by-need wording; add a forbidden-term test (learning style, diagnosis, personality type, disorder).

**Phase 1 (first 2 weeks).**
1. Calibration gap and retrieval share in `lib/mirror/profile.ts` with decay (existing `confidence` signal).
2. Two prompts through existing Sprout surfaces: confidence-before-answer on quizzes, weekly if-then plan.
3. Optional check-in (6 own items, 2 minutes), stored `you_set`.
4. Declared optional fields on mentor and tutor profiles (5h) and "why this match" reasons in `/api/mentors/matches`; fit score behind a flag, control = current score.
5. Evidence display in `/my-learning-map`: each inference with its basis and an edit button.

**Cost per learner.** Inference is arithmetic on counters already stored, so about zero AI cost. The only AI call is the existing weekly two-sentence summary (quota-checked). Extra Firestore is a few writes per session at most. I did not cost Firestore; my estimate of well under a few kobo per learner per month is a hypothesis to check against the usage dashboard.

**Phase 2 (weeks 3 to 8).** Entry-adjusted teacher gain stats with minimum n; run the 5g A/B; pilot the check-in with 50 to 100 students in English and Pidgin.

**Privacy review checklist (NDPA 2023; confirm with a Nigerian lawyer).**
- [ ] Lawful basis recorded: consent for the study profile, separate consent for use in match.
- [ ] Under-18: age gate, parent or guardian consent (s.31 as reported; verify), notice in plain language, decide a floor age.
- [ ] Minimisation: counters only, no free text, no answers, no health data; check-in has no clinical items.
- [ ] Purpose limitation: no ads, not shown to teachers or schools without separate consent.
- [ ] Rights: view, correct, delete, export (audit item P-01 says export was missing; recheck).
- [ ] Retention: decay exists; add hard expiry for inactive profiles.
- [ ] DPIA for profiling of children; NDPC registration thresholds and GAID duties: confirm with counsel.
- [ ] Vendor: weekly summary sends habit facts only, no names or ids.
- [ ] Bias audit: outcomes and exposure by language, device, school type.
- [ ] Security: owner-only rules (exist), logs free of profile contents.

**Measurement plan.** Pre-register: mastery gain per hour and delayed retention (as in `LEARNER-MIRROR.md`), plus calibration error trend (mean absolute gap between confidence and correctness over 4 weeks), plan adherence, review adherence, match outcomes. Fix minimum detectable effect and sample size before launch. Stop rules: retention worse in treatment, rising `too_hard`, complaints, required-class attendance drop. Report 95 percent intervals; keep null results.

---

## 7. Distress, safety and ethics
- **Do not counsel and do not assess.** Say once, plainly, that this is a study app, not a clinical tool.
- Distress cues (explicit statements in chat about self-harm, abuse, hopelessness; never inferred from behaviour) trigger a fixed, human-reviewed response: a short kind message, "this is bigger than a study app", and signposting to local help plus "tell a trusted adult". The founder must verify Nigerian services and numbers before launch: I verified none, and none should be taken from memory. Do not store the content in the profile; log only that a signpost was shown.
- Never infer mental health from behaviour (late-night study, skipping): no valid basis.
- Minors: parental consent, no teacher-visible profile, no public display of profile attributes.
- Transparency: say what is collected, why, what it changes, how to switch off and delete.
- Bias: "pace" and "persistence" can proxy for device quality, data cost, electricity or home duties. Treat as descriptions of a session, not ability; never rank learners or gate content.
- Labels: no category a person could hear as a verdict.

---

## 8. Open questions for the founder
1. Which "teacher": lecturer, peer mentor, peer tutor, or all? (5a)
2. Are under-18 users in scope now? This decides the consent flow.
3. May a matched mentor see anything from the student's profile if the student allows it?
4. Hide or still list teachers with too little data?
5. Will you run the A/B and accept a null result on anything beyond practical fit?
6. Which Nigerian languages first for the check-in and "language I explain in"?
7. Who verifies local crisis resources and who reviews flagged conversations?
8. Budget for a legal review of the NDPA and GAID?
9. OK to retire "cohort" labels in the UI?
10. Include mindset or test-anxiety messages at all, given contested evidence, or only behaviour-based nudges?

## 9. What I could not verify
Primary text of the NDPA and GAID; any Nigeria-specific effectiveness study; exact effect sizes for Poropat, Yeager, Credé, von der Embse, Gollwitzer and Sheeran (recalled); commercial licences of MSLQ, SDT scales, Westside scale and BFI-2; any Nigerian helpline; Firestore cost per learner; `lib/experiments` internals.
