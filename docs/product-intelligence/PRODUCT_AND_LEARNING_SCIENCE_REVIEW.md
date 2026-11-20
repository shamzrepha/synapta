# SunRootLearn: Product and Learning-Science Review

Author role: EdTech product researcher / learning scientist. Slice 1 of a 10-agent audit. Date of review and of all web access: **2026-11-19**.
Branch: worktree-agent-a1dd9f09c64291cae. Read-only on the product; this file is the only artifact.

## 0. How to read this document

- **Repo claims** are from reading code and docs in this worktree (paths given). Other agents audit individual features and engines in depth; I only checked what I compare.
- **External claims** carry a URL and the access date 2026-11-19. Where I could only reach a search-result summary and not the primary page, I say so ("secondary"). Several official pricing pages could not be opened directly (they returned blank or 403 to my fetch tool), so **competitor prices below are indicative and must be re-verified on the official page before use in any pitch**.
- **Evidence labels** for learning-science claims: **Strong** (multiple meta-analyses or large RCTs, replicated), **Moderate** (meta-analysis with heterogeneity, or good RCTs in narrow settings), **Emerging** (few studies, preprints, or correlational), **Hypothesis** (my architectural inference, not established).
- I invent no figures about SunRootLearn or competitors' users, revenue, retention or learning outcomes. SunRootLearn has **no published efficacy evidence** that I could find in the repo (no study, no pilot results, no cohort data).
- Limitation: I did not open the full text of every cited paper. Where a figure came from an abstract or index summary it is flagged "(abstract-level)". Some classic citations (Sweller 1988, Barnett and Ceci 2002, Bjork 1994, Black and Wiliam 1998, Chi 1994, Bloom 1984, Corbett and Anderson 1994) are given from my own knowledge and were **not re-fetched this session**; they are marked "(not re-fetched)".

---

## 1. Product identity (from the implementation)

### 1.1 What it is

The README calls it "Synapta"; CLAUDE.md and the UI call it Sunroot / SunRootLearn. It is one Next.js 16 / Firebase app with roughly 90 `app/(app)` page routes and about 60 API route groups, plus a separate native Android shell (`sunroot-mobile`; APKs 3.2 and 3.3 sit in `public/`, which CLAUDE.md says should not be committed). It is simultaneously:

1. **A lecturer-led LMS-lite** (`classes/*`, `teach/*`, `lib/teacher/*`, `lib/schools/*`): create a class, AI-synthesise a syllabus into a prerequisite graph of Knowledge Components (KCs), ingest materials (`lib/teacher/materialIngest.ts`, `materialRouter.ts`), generate assignments with rubrics (`assignment_architect/author/reviewer` in `lib/ai/tasks.ts`), grade (`lib/grading`), attendance, heatmap, announcements.
2. **A student-owned AI study toolkit** (`study/*`, `notebook`, `worlds`, `ask`, `tutor`, `lib/flashcards`, `lib/fsrs`, `lib/mistakes`, `lib/papers`, `lib/exam`): notes, scan/snap, flashcards, quizzes, exams, past-question solver, a NotebookLM-like source-grounded notebook with a 2-host "Deep Dive" audio, mind maps, a mistake log.
3. **A learner model**: Bayesian Knowledge Tracing per KC (`lib/bkt/engine.ts`; activity weights quiz 1.0 / flashcard 1.25 / lab 1.75 / peer-explain 2.0; mastery 0.95, struggling < 0.40, prerequisite unlock 0.70), FSRS scheduling through `ts-fsrs` (`lib/fsrs/scheduler.ts`), and a "Learner DNA" pace profile that picks a scaffold (`lib/adaptive/learner-dna.ts`: socratic micro-steps / worked-example-first / visual-simulation-first / stretch).
4. **Simulations and making** (`components/labs/*`, `lib/sim/*`, `studio/*`): four hand-coded labs (Ohm, RC, logic gates, projectile), an AI-generated simulation lab, a "Maker Studio" circuit bench and 3D viewer with AI help.
5. **A social/game layer** (`feed`, `communities`, `groups`, `lounge`, `friends`, `messages`, `shoutouts`, `polls`, `pet`, `shop`, `quests`, `streak`, `leaderboard`, `challenges`, `focus`, `mentors`, `tutors`).
6. **A billing system** in naira (`lib/billing/plans.ts`, Paystack): Free; Exam Pass N1,500/mo or N5,000/term; Plus N3,500 / N11,000; Pro N6,000 / N19,000; Pro Max N9,000 / N21,000; Ultra N15,000 / N34,000; Teacher N7,500 / N20,000; Teacher Pro N15,000 / N40,000; School N1,200 per student per semester (invoiced). "Term" = 4 months (a Nigerian semester). Limits are only enforced when `BILLING_ENFORCED=1`, and the code comment says prices are placeholders "once real AI costs are known". The file-header principle (shared, made-once content is free; per-person AI is metered) is cost-aligned and sound.

### 1.2 Primary users

| User | Evidence in code | Reality check |
|---|---|---|
| Nigerian university student (and exam-prep secondary student) | Naira pricing, 4-month semester pass, past-question solver, Exam Pass, local-language audio (Igbo/Hausa noted in `lib/lesson/audio.ts`), offline downloads | Clear main user. Exam-season revision is the strongest fit. |
| Lecturer / teacher | `classes/manage`, `teach/*`, class builder, heatmap, grading, Teacher plans | Present; "your lecturers publish, students get it free" is a classic two-sided adoption model. Depth not verified by me. |
| School / department | `lib/schools` (csv, policy, standings), per-seat price | Thin. I saw no SSO, SIS or LTI integration. |

### 1.3 Problem it solves

A Nigerian student has uneven handouts, a high-stakes exam, little tutoring, expensive data, unreliable power and a phone rather than a laptop. SunRootLearn turns the student's or lecturer's materials into practice with feedback and a mastery picture, cheaply, in naira. That is a real problem. The pitch I would defend: **"Turn course material into practice-with-feedback, priced for a Nigerian semester, and give the lecturer the class mastery picture."**

### 1.4 What makes it different (honestly)

| Claim | Verdict |
|---|---|
| BKT mastery model feeding map, heatmap, peer matching | **Uncommon in a student-facing consumer product** (BKT is classical, Corbett and Anderson 1994, not re-fetched; a JEDM summary confirms its place in the literature: https://jedm.educationaldatamining.org/index.php/JEDM/article/view/553, accessed 2026-11-19). But parameters are defaults (`pL0 0.20, pT 0.15, pG 0.20, pS 0.10`) and the activity weights are **unvalidated design constants**. BKT with uncalibrated parameters is a heuristic, not a measurement; BKT parameter identifiability is a known issue (same JEDM source, secondary). |
| FSRS spacing | **Ordinary now.** `ts-fsrs` is open source, Anki ships FSRS (App Store listing: https://apps.apple.com/app/id373493387, accessed 2026-11-19). Good choice, not a moat. |
| AI generation from class materials | **Ordinary in 2026** (NotebookLM, Quizlet, RemNote, Khanmigo teacher tools). The difference is the pipeline into a class graph with lecturer review. |
| Local-language audio, naira pricing, semester pass, Paystack | **Real regional advantage** that global products do not target. A local competitor can copy it; Duolingo or Quizlet will not do it quickly. |
| Hands-on simulations / maker studio | **Strong for engineering/physics**, but only four hand-built labs are verifiable; the rest is AI-generated and of unknown correctness. The animated lesson engine spec is explicitly "not built yet" (`docs/design/INTERACTIVE-LESSON-ENGINE.md`). |
| Socratic tutor with hint ladder | Present as a prompt harness (`lib/ai/prompts.ts` "3-tier hint ladder"). Valuable if enforced; a prompt is a soft guardrail (section 3.17). |
| Offline downloads | Cache Storage downloads of selected items (`lib/offline/items.ts`, `public/sw-policy.js`). Useful, narrow; not offline-first. |

**Strongest potential differentiator (my judgment):** the lecturer-to-student mastery loop in the Nigerian semester context. A lecturer uploads material once, the class graph and practice are generated and reviewed, students get free practice and a mastery picture, and the lecturer sees which KCs the class is failing before the exam. I found no global competitor that combines local exam context, naira pricing, lecturer analytics and a student toolkit. Everything else (AI notes, flashcards, podcasts) is a commodity.

### 1.5 Better and worse than a conventional LMS (Moodle, Coursera for Campus)

Better: instant AI content from the lecturer's own files; a per-student mastery model, not a gradebook only; embedded practice, simulations and tutoring; mobile-first; student-initiated adoption without procurement; N1,200 per student per semester for schools.
Worse: no LTI/SCORM/SSO/gradebook sync that universities expect; no verified assessment integrity or psychometrically reviewed question banks; no accreditation reporting; no multi-institution admin; Moodle has a large plugin ecosystem and self-hosting (MoodleCloud plans overview, secondary: https://support.moodle.com/support/solutions/articles/80000833221-moodlecloud-plans-overview, accessed 2026-11-19; I did not verify Moodle's licence or mobile offline specifics). A university LMS does far more than SunRootLearn. It should position as a **companion to the LMS, not a replacement**.

### 1.6 Five strongest features (learning value x differentiation x implementation evidence)

1. **Class graph + lecturer-reviewed AI content + class mastery heatmap** (`lib/teacher/*`, `classes/[classId]/heatmap`). The lecturer-adoption wedge.
2. **FSRS flashcards with answer-derived ratings** (`lib/worlds/memory.ts` maps wrong/slow/hinted/first-try-fast to Again/Hard/Good/Easy and caps same-concept runs at three). Retrieval plus spacing with a real scheduler.
3. **Exam / past-question practice with step-by-step worked solutions and "twin" drills** (`lib/papers`, `lib/exam`, Exam Pass). Worked examples plus retrieval, aimed at the moment of highest willingness to pay.
4. **Source-grounded Notebook with citations** (`lib/notebook`, TF-IDF retrieval, `[S1]` chips). Grounding builds trust. Commodity versus NotebookLM, but sound.
5. **Mistake log + student-evaluation task** (`lib/mistakes`, `student_evaluation` task naming gaps and misconceptions). Metacognition-adjacent, cheap, valuable if the plan is actionable.

### 1.6b Five weakest features (as product bets)

1. **Social/pet/shop/shoutouts/polls/feed/communities cluster.** Large surface, no evidence it serves learning, real moderation and child-safety burden.
2. **Five paid student tiers + two teacher tiers + school.** Differences are AI quotas students cannot reason about ("scanned pages", "Maker Studio builds"). Pricing confusion lowers conversion (hypothesis).
3. **XP / leagues / leaderboard / streak economy** (`lib/game/*`). Risks rewarding activity over learning (section 3.15). The repo's own design doc says rewards should be small and capped.
4. **Maker Studio circuit/3D for a general audience.** Impressive but niche, high build and verification cost.
5. **Peer-lounge matching** (`pL < 0.40` with `pL >= 0.85`). Attractive, unvalidated: matching on uncalibrated BKT will mismatch, and the 2.0 evidence weight for "peer explain" is an XP-farming vector between friends despite the anti-farming guard.

### 1.7 Confusing or redundant

- Many overlapping study entry points: `study`, `study/notes`, `study/flashcards`, `study/exams`, `study/papers`, `study/snap`, `study/mindmap`, `study/daily`, `study/mistakes`, `study/evaluation`, plus `notebook`, `worlds`, `explainers`, `ask`, `tutor`, `tutor/voice`, `saved`, `search`. A student cannot tell where to start. Several question/card stores appear to coexist (`lib/flashcards`, `lib/cards`, `lib/worlds/memory`, `lib/practice/bank`); another agent should confirm.
- **Two parallel mastery systems**: BKT per class KC and FSRS per card/knowledge unit. In the code I read I saw no link between FSRS reviews and BKT pL outside the worlds progress route; the student sees "mastery" and "due cards" as separate ideas.
- **Docs lag the product.** README describes a handful of features; `docs/PROGRESS.md` stops at Phase 11 "In Progress" and Phase 12 "Pending"; `docs/design/LEARNING-LOOP.md` cites research "from memory, not re-checked" and lists as "Not built yet": predict-before-run in labs, interleaving across chapters, adaptive fading of hints. Treat docs as aspiration unless the code agrees.

### 1.8 What to simplify or remove

- Collapse student tiers to **Free / Exam Pass (exam month) / Semester Pass**, plus one teacher plan. Hide quotas behind fair use.
- Hide from default navigation until learning value is shown: pet, shop, shoutouts, polls, feed, communities, mentors, lounge. Keep groups/friends only as "study with a friend".
- Make a single **Today** screen the home: due cards + one weak KC + one past question.
- One question bank, one scheduler, one mastery estimate per student.
- Do not market the BKT "Cognitive Digital Twin" until parameters are calibrated on real data.

### 1.9 What would make students return daily for genuine learning

1. A **10-minute daily session** assembled by the scheduler: due cards, one weak-KC retrieval quiz, one interleaved mixed set, one exam question tied to the student's real exam date. Practice testing and distributed practice are the best-supported strategies (Dunlosky et al. 2013, section 3). Hypothesis: an exam countdown is a stronger daily driver than a streak in this market.
2. **Honest progress**: "you can now do X; last week you could not", tied to KC mastery with uncertainty shown.
3. **Low data cost**: download the day's session once, work offline (section 4).
4. Streaks as a light nudge only, never a paid or shop mechanic.

### 1.10 What would make lecturers recommend it

- Upload once; **review and approve AI content in minutes per topic**; clear provenance ("AI draft" vs "lecturer approved").
- A **weekly class report** naming the three weakest KCs and the specific misconceptions (`lib/teacher/misconceptions.ts` is the right base) with a suggested 10-minute in-class remedy.
- Gradebook/CSV export (heatmap CSV exists); zero lecturer cost for the basics.
- Assurance on correctness (`qualityCheck.ts` exists) and a data-protection statement.

### 1.11 What would make students pay

Students pay when stakes are imminent and a result is visible. The Exam Pass (N1,500 for a month) is the most credible offer in the current ladder. Hypotheses to test: (a) a free diagnostic that exposes gaps, (b) a visible "readiness for your exam date" estimate, (c) local payment methods, (d) a class-rep bundle. Sell readiness for an exam, not AI quota.

---

## 2. Competitive comparison

### 2.1 Pricing snapshot (indicative; access date 2026-11-19)

Only some of these come from an official page I could actually read. "Official (via search summary)" means the search tool quoted the official page but I could not open it directly. Everything marked "third-party" must be re-checked.

| Product | Price signal | Source and confidence |
|---|---|---|
| SunRootLearn | Free; Exam Pass N1,500/mo; Plus N3,500/mo; Pro N6,000/mo; Pro Max N9,000/mo; Ultra N15,000/mo; semester passes N5,000 to N34,000; school N1,200 per student per semester | `lib/billing/plans.ts`; placeholders; enforcement off by default |
| Duolingo | Super about US$13.99/mo or US$95.99/yr; Max about US$29.99/mo or US$167.99/yr (Max adds Video Call and Roleplay AI features); prices vary by region | Third-party (https://www.titikey.com/en/article/tjkbqt-bhiuu); conflicting with Subger; **unverified** |
| Brilliant | Annual cheapest per month; Premium, family and group plans exist; group plan 3 seats at US$11.33 per person per month | Official help page confirms structure only (https://brilliant.org/help/pricing-and-plans/); numeric prices conflict across third parties; **unverified** |
| Khan Academy / Khanmigo | Khan Academy free; Khanmigo learner subscription US$4/month, US only; teachers free | Official Khanmigo pages via search summary (https://khanmigo.ai/pricing, https://khanmigo.ai/learners); fairly reliable, US only |
| Quizlet | Plus about US$7.99/mo or US$35.99/yr; Plus Unlimited about US$9.99/mo or US$44.99/yr; free tier limited | Third-party citing quizlet.com/upgrade; Help Center https://help.quizlet.com/hc/en-us/articles/360041181691 confirms subscription exists; **unverified numbers** |
| Anki | Desktop and AnkiWeb free; AnkiDroid free (volunteer); AnkiMobile iOS paid one-time, price varies by country | App Store listing https://apps.apple.com/app/id373493387; community forum for AnkiDroid; moderate |
| RemNote | Free; Pro about US$8/mo billed yearly; Pro with AI about US$18/mo billed yearly; 25% education discount and location-specific discounts mentioned | https://remnote.com/pricing and https://help.remnote.com/en/articles/6084981-remnote-pro-subscriptions via search summary; moderate |
| NotebookLM | Free tier with daily limits; higher limits via Google AI plans (AI Pro about US$19.99/mo in a May 2026 third-party table) | Official limits page https://support.google.com/notebooklm/answer/16213268 (could not read table); prices third-party; **unverified**; naming/pricing changed repeatedly in 2026 |
| Coursera Plus | US$399/yr regular; US$239 first-year promo to 30 Nov 2026 | Official https://coursera.org/courseraplus via search summary; reliable |
| Moodle | Software self-hostable; MoodleCloud annual plans billed in AUD | https://support.moodle.com/support/solutions/articles/80000833221; plan prices conflict across aggregators; **unverified** |
| uLesson (Nigeria) | 2024 price halving reported (3-month plan N20,000 to N12,000; 6-month N50,000 to N25,000); a 2026 aggregator shows from N7,499/mo | Secondary (https://techpoint.africa/2024/02/20/ulesson-halves-educational-subscription-fees-nigeria/, https://www.techcityng.com listing); **conflicting; verify with uLesson** |
| Eneza Education (Kenya) | SMS/USSD curriculum quizzes and teacher Q&A | Secondary (https://www.engineeringforchange.org/solutions/product/eneza-education/); pricing not found |
| Kolibri (Learning Equality) | Open-source offline-first platform; content imported to local server | https://learningequality.org/kolibri/ via search summary |
| Rori (Rising Academies, Ghana) | WhatsApp AI maths tutor; trial reported 0.36 to 0.37 SD | arXiv 2402.09809 (https://arxiv.org/abs/2402.09809), preprint plus conference version; summary-level |

SunRootLearn prices look **cheap versus Western subscriptions in absolute terms but not obviously cheap locally**: N3,500/month is about six 1 GB data bundles at the TechCabal 2025 average of about N575 per GB (https://techcabal.com/2025/09/01/nigeria-data-spend-721bn-monthly/, secondary; the average is TechCabal's own calculation). Price sensitivity needs testing, not assuming.

### 2.2 Capability comparison

Legend for SunRootLearn column: **Built** = I saw implementation; **Partial** = exists with caveats; **Spec only** = docs say not built. For competitors I only state what I am confident of; "?" means I did not verify.

| Capability | SunRootLearn | Competitor | Gap | Opportunity |
|---|---|---|---|---|
| Adaptive learning | Partial: BKT per KC, Learner DNA scaffold choice; uncalibrated params, no outcome validation | Duolingo uses its own adaptive models (Birdbrain; not re-verified); Khan has mastery levels; Cognitive-Tutor-style ITS have decades of validation | SunRootLearn lacks calibration and any effect evidence | Fit BKT/PFA parameters per KC from real logs; publish a small validation |
| Mastery tracking | Built: pL per KC, prerequisite unlock 0.70, mastery 0.95, class heatmap | Khan Academy (skill levels, free); Moodle (completion, grades, competencies) | Khan is free and trusted; SunRootLearn's number is opaque to students | Show "what you can do" statements and confidence; link to lecturer's exam |
| Spaced repetition | Built: ts-fsrs in flashcards and worlds | Anki (FSRS, free), RemNote (SRS built in), Quizlet (Learn mode, limited free rounds) | Parity with Anki scheduler; weaker authoring and community decks | Auto-generate from class material and past questions; make it the daily home |
| AI tutoring | Partial: Socratic hint-ladder prompt, voice tutor, ask | Khanmigo (Socratic, US$4, US only); Rori (WhatsApp, Ghana, RCT); Duolingo Max (language) | Khanmigo/Rori have published design and (Rori) trial evidence | Evaluate guardrail adherence; add "attempt first" gate; local-curriculum grounding |
| Interactive simulations | Partial: four hand-built labs, AI sim lab, circuit studio | Brilliant (curated interactives, strong craft); PhET (not compared here) | Brilliant is curated and tested; AI sims risk wrong physics | Pick 20 high-yield Nigerian-curriculum sims, hand-verify; ban unverified AI sims from graded paths |
| Learning by doing | Partial: labs, "prove it" tasks, studio; predict-before-run listed as not built | Brilliant; Duolingo | Predict-observe-explain not shipped | Add predict-first prompts (low complexity) |
| Course publishing | Built: class builder, materials router, lecturer review | Moodle (full authoring, SCORM, plugins), Coursera (partner courses), Khan (no teacher authoring of core content) | No LTI/SCORM/SSO; fewer content types | Position as a companion; add CSV/Google Classroom-style export before LTI |
| Teacher analytics | Built: heatmap, misconception store, CSV | Moodle reports (broad); Khan teacher dashboard (free) | Uncalibrated mastery numbers; no intervention suggestions | "Three weakest KCs and what to say Monday" report |
| Personalisation | Partial: pace profile, own-notes generation | Quizlet, RemNote (own notes), NotebookLM (own sources) | NotebookLM/RemNote set the bar for own-source generation | Personalise by exam date and prior performance, not by AI quota |
| Gamification | Built, extensive: XP, streaks, leagues, pet, shop, quests | Duolingo is the category leader | SunRootLearn's is broader but unproven; risk of overjustification (3.15) | Cut to streak + exam countdown + earned badges for mastery |
| Audio learning | Built: Deep Dive 2-host podcast, TTS in local voices incl. Igbo/Hausa (per code comments) | NotebookLM Audio Overviews (limits tiered by plan per official page) | NotebookLM quality is high and free-tier available; SunRootLearn differentiates on local languages | Own the local-language, class-aligned, downloadable audio niche |
| Offline support | Partial: selected downloads via Cache Storage; Android shell | Kolibri (offline-first server); Eneza (SMS/USSD, works without data); uLesson (offline packs, secondary); Anki (fully offline); Moodle app (?) | Not offline-first; sync/conflict handling unverified | Daily-session pack download (section 4); defer writes and sync evidence on reconnect |
| Pricing | Naira ladder, 9 plans, enforcement off | Khanmigo US$4 (US only); Anki free/one-time; NotebookLM free tier; Coursera Plus US$399/yr | Too many tiers; no verified willingness to pay | Fewer, exam-anchored plans; class bundles |

### 2.3 Honest read of the competition

- **Google (NotebookLM) and Khan Academy are the real threat** to the "AI notes and tutor" half of the product because they are free or very cheap. SunRootLearn cannot win on generic generation.
- **Anki/RemNote/Quizlet** own the memorisation workflow. SunRootLearn's flashcards are parity at best.
- **Duolingo/Brilliant** own craft and habit. Copying gamification without their content craft yields the surface but not the learning.
- **Local players (uLesson, Eneza, Kolibri)** show offline and price-sensitivity are decisive in this market; none that I found offers a lecturer-class graph with university course material. That is the open lane. I did not find evidence on Nigerian university-focused AI products specifically; absence of evidence from a limited search is not evidence of absence.
- Rori and the Edo State pilot (section 3.17) show that **well-scaffolded AI tutoring with a human system around it can work in Africa**; both involved structure (curriculum alignment, teacher or lab setting), not a bare chatbot.

---

## 3. Learning-science review

Each entry: principle, research, expected effect, fit in SunRootLearn, complexity, limits. Effect sizes are as reported in the cited abstract; they are not forecasts for SunRootLearn.

### 3.1 Retrieval practice (testing effect)
- **Research:** Roediger and Karpicke 2006 (Psychological Science; not re-fetched in detail); Karpicke and Blunt 2011, Science: retrieval practice beat elaborative concept mapping, including on inference questions (https://pubmed.ncbi.nlm.nih.gov/21252317/, accessed 2026-11-19); Adesope, Trevisan and Sundararajan 2017, Review of Educational Research, meta-analysis of practice testing, 118 articles, 272 effect sizes (https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/Rethinking-the-Use-of-Tests-A/99900601154801842, secondary; pooled g not confirmed by me); Dunlosky et al. 2013 rated practice testing "high utility" (https://scholars.duke.edu/publication/954654).
- **Evidence:** **Strong.** Direction: reliably positive versus restudy; magnitude varies with test type and feedback.
- **Fit:** Flashcards, quizzes, "close the book" recall check (docs), past-question drills, worlds activities.
- **Complexity:** Low (mostly present). Gap: make retrieval the default order (attempt before reveal) everywhere, including AI-generated notes, where "read" is the easy default.
- **Limits:** Low-quality AI questions test trivia; effect is smaller for complex transfer; students rate retrieval as harder and may drop it (Karpicke and Blunt found students predicted concept mapping would work better).

### 3.2 Spaced practice
- **Research:** Cepeda et al. 2006, Psychological Bulletin, 839 assessments in 317 experiments (https://pubmed.ncbi.nlm.nih.gov/16719566/); Cepeda et al. 2008, Psychological Science: optimal gap about 20% of the test delay for delays of weeks, falling to about 5% at one year (https://pubmed.ncbi.nlm.nih.gov/19076480/). Dunlosky 2013: high utility. All accessed 2026-11-19.
- **Evidence:** **Strong** for verbal/factual material; weaker for procedural and complex skills.
- **Fit:** `lib/fsrs/scheduler.ts`, worlds memory. Gap: no exam-date-aware scheduling; the 2008 result says the right gap depends on the retention interval, so a student with an exam in 3 weeks needs a different schedule from one with a year.
- **Complexity:** Medium (set FSRS desired retention from days-to-exam; "cram mode" for compressed timelines).
- **Limits:** Semester dislocation (ASUU-type strikes, section 4) makes exam dates uncertain; schedulers need re-planning. FSRS default parameters are not tuned for this population (hypothesis).

### 3.3 Interleaving
- **Research:** Brunmair and Richter 2019 meta-analysis: overall g = 0.42, maths g = 0.34 (https://pubmed.ncbi.nlm.nih.gov/31556629/, abstract-level, accessed 2026-11-19); Rohrer et al. 2019 preregistered classroom RCT in maths (title confirmed via search only). Dunlosky 2013: moderate utility.
- **Evidence:** **Moderate.** Benefit depends on similarity of the categories being interleaved.
- **Fit:** Worlds memory caps same-concept runs at three (a mild form). `LEARNING-LOOP.md` lists chapter-level interleaving as not built.
- **Complexity:** Low to medium: mixed-topic practice sets in exam drills.
- **Limits:** Feels worse and scores lower during practice; students may abandon it. Introduce after initial blocked learning.

### 3.4 Feedback timing and quality
- **Research:** Hattie and Timperley 2007, Review of Educational Research: feedback can have positive or negative impact; the model asks where am I going, how am I going, where to next (https://www.uky.edu/~gmswan3/575/Hattie_Timperly_2007.pdf, secondary listing). Wisniewski, Zierer and Hattie 2020 meta-analysis d = 0.48 with high heterogeneity (secondary, from search summary). Adesope et al. 2017: feedback on tests had mixed incremental effect.
- **Evidence:** **Moderate** (large but heterogeneous).
- **Fit:** Quiz explanations, answer reveal, AI grading (`lib/grading`), worked solutions. Docs frame feedback with the three Hattie questions.
- **Complexity:** Low to medium.
- **Limits:** Immediate feedback after errors helps; but immediate answers during practice can undercut effort (3.17). Feedback that is wrong (AI) is worse than none; grade-critical feedback needs checks.

### 3.5 Worked examples
- **Research:** Sweller and Cooper 1985 (not re-fetched); Barbieri, Miller-Cotto, Clerjuste and Chawla 2023, Educational Psychology Review, meta-analysis in maths, Hedges g = 0.48; correct examples worked better than incorrect or mixed (https://oaks.kent.edu/hcri/meta-analysis-worked-examples-effect-mathematics-performance, secondary, accessed 2026-11-19).
- **Evidence:** **Strong** for novices; **expertise-reversal** means benefit shrinks as skill rises.
- **Fit:** Exam Pass step-by-step solutions; "worked_example_first" scaffold in Learner DNA.
- **Complexity:** Low (present); medium to fade examples into problems as mastery rises (completion problems).
- **Limits:** Passive reading of solutions feels like learning (illusion of competence); pair with a self-explanation prompt and a faded problem next.

### 3.6 Cognitive load management
- **Research:** Sweller 1988 (not re-fetched); Mayer 2008 American Psychologist principles (segmenting, signaling, coherence; secondary: https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655).
- **Evidence:** **Moderate to Strong** for design principles; effect sizes depend on learner expertise.
- **Fit:** Short chapter pages, one-operation-per-step lessons (design docs); data-light mobile UI is also a load matter.
- **Complexity:** Low.
- **Limits:** Cognitive load is hard to measure; "less" is not always better for experts. The maximal feature count of this app is itself a load problem for navigation (section 1.7).

### 3.7 Self-explanation
- **Research:** Chi et al. 1994 (not re-fetched); Bisra et al. 2018, Educational Psychology Review: g = 0.55 over 69 effect sizes in 64 reports (https://doi.org/10.1007/s10648-018-9434-x, abstract-level via search, accessed 2026-11-19).
- **Evidence:** **Moderate to Strong.**
- **Fit:** "Teach me"/"teach the bot" tasks graded by `grading_high_stakes`, peer explain in the lounge, tutor prompts.
- **Complexity:** Low to medium. Constrain to short typed or spoken explanations.
- **Limits:** Weak learners produce weak explanations; AI grading of explanations is itself uncertain; Barbieri 2023 found worked examples plus self-explanation prompts associated with lower performance than without (secondary), a reminder that combos need testing.

### 3.8 Metacognition and confidence calibration
- **Research:** Butterfield and Metcalfe 2001: errors made with high confidence are more likely to be corrected on retest (hypercorrection) (https://pmc.ncbi.nlm.nih.gov/articles/PMC3079415, abstract-level). Overconfidence literature (Dunlosky and Rawson 2012; not found in my search, not cited as verified).
- **Evidence:** **Moderate** for hypercorrection; calibration training effects on achievement are **Emerging/mixed**.
- **Fit:** I found **no confidence rating in learner quiz flows** (grep hits were in diagnostic copy and grading). That is a clean gap: add a one-tap "How sure are you?" before reveal; BKT can use it (high-confidence wrong answers signal a misconception, the `misconceptions` store can record it).
- **Complexity:** Low.
- **Limits:** Extra tap adds friction; students may game ratings; calibration displays can demotivate low performers. Keep optional on the first weeks.

### 3.9 Mastery learning
- **Research:** Bloom 1984 (not re-fetched); Kulik, Kulik and Bangert-Drowns 1990, Review of Educational Research, 108 controlled evaluations, positive effects on exam performance (https://www.academia.edu/81783373/Effectiveness_of_Mastery_Learning_Programs_A_Meta_Analysis, secondary; I could not confirm an exact mean effect size, and a figure of 0.52 I saw may belong to earlier work; do not quote it).
- **Evidence:** **Moderate**: consistent positive effects, largest on locally written tests, with time-in-class tradeoffs.
- **Fit:** KC graph with prerequisite unlock at pL 0.70 and mastery at 0.95.
- **Complexity:** Medium (already built; hard part is calibrating).
- **Limits:** A 0.95 threshold on an uncalibrated BKT may keep students on a KC they know (BKT slip/guess issues) or let them pass one they do not. Gating by a bad model frustrates. Offer "challenge test" to skip, and always allow lecturer override.

### 3.10 Formative assessment
- **Research:** Black and Wiliam 1998 (Assessment in Education; not re-fetched). Hattie and Timperley 2007 as above.
- **Evidence:** **Moderate** (claimed large gains are contested; effects depend on how feedback is used).
- **Fit:** Class diagnostic (`classes/[classId]/diagnostic`), recall checks, heatmap for lecturers.
- **Complexity:** Low to medium. The lecturer "so what" report is the missing piece.
- **Limits:** Data without a teacher response changes nothing.

### 3.11 Desirable difficulties
- **Research:** Bjork 1994 / Bjork and Bjork 2011 (not re-fetched); spacing, interleaving, retrieval and generation are the evidence-backed examples above.
- **Evidence:** **Moderate** as a framework; individual techniques vary from Strong to Moderate.
- **Fit:** Recall before reveal; hint ladder; delayed review.
- **Complexity:** Low.
- **Limits:** A difficulty is only "desirable" if learners can succeed with effort. Struggling learners with little prior knowledge need worked examples first. Dropout risk is high for weak students in a free-to-quit mobile app.

### 3.12 Transfer
- **Research:** Barnett and Ceci 2002, Psychological Bulletin, taxonomy of far/near transfer (not re-fetched). Karpicke and Blunt 2011 inference questions show some transfer from retrieval.
- **Evidence:** **Emerging** to **Moderate**; far transfer is rarely demonstrated and rarely measured by products.
- **Fit:** Twin drills (same structure, new surface), labs with parameter variation, Past-question "twin" tests.
- **Complexity:** Medium: generate isomorphic problems with verified answers.
- **Limits:** AI-generated "twins" can be subtly different in difficulty or wrong; needs verification (`lib/labs/verify.ts` shows the right pattern: deterministic checks).

### 3.13 Dual coding and multimedia learning
- **Research:** Paivio (not fetched); Mayer 2008 principles (secondary link above).
- **Evidence:** **Moderate**: replicated for multimedia/signaling/coherence in lab studies, less in real mobile contexts.
- **Fit:** Interactive notes interleave prose with motion figures (`components/lesson/interactive-note.tsx`); diagrams, labs, audio with highlighted text.
- **Complexity:** Medium (mostly present).
- **Limits:** Decorative animation adds load (coherence principle). Video/audio costs data in Nigeria (section 4). Audio-only is poor for diagrams and formulae.

### 3.14 Adaptive difficulty
- **Research:** Kulik and Fletcher 2016, Review of Educational Research, 50 controlled evaluations of intelligent tutoring systems: median effect 0.66 SD (https://journals.sagepub.com/doi/abs/10.3102/0034654315581420; effect smaller with standardised tests, secondary). Ma et al. 2014: g about 0.41 versus teacher-led (secondary, same search).
- **Evidence:** **Moderate**; large for local tests, small for standardised ones, from structured, extensively authored tutors in the US.
- **Fit:** BKT, Learner DNA, FSRS.
- **Complexity:** High to do properly (item calibration, parameter fitting, validation); low to do crudely (the current state).
- **Limits:** The ITS effect sizes came from expert-authored content and model-tracing with calibrated items; transferring them to LLM-generated items with default BKT parameters is an **unsupported leap**. Do not cite 0.66 for SunRootLearn.

### 3.15 Motivation, gamification and engagement versus learning
- **Research:** Self-Determination Theory is cited in the repo docs (not re-fetched). I did not retrieve meta-analytic evidence on gamification effects in this session; I therefore make **no effect claim**. Honest statement: gamification reliably raises time-on-app; whether it raises learning depends on whether the rewarded behaviour is the learning behaviour (hypothesis, consistent with the Bastani crutch finding in 3.17).
- **Fit:** XP/streaks/leagues/pet/shop (`lib/game/*`, `lib/quests`).
- **Complexity:** Low to remove or rebalance.
- **Limits:** Rewarding completions (labs weight 1.75, peer explain 2.0 evidence weight) can be farmed. Reward spaced returns and mastery gains, not volume.

### 3.16 Formative signals for lecturers (class-level)
- Covered by 3.10. Added risk: a single class heatmap built from BKT pL is easy to misread when n is small or items are few; show counts and uncertainty.

### 3.17 AI tutors, productive struggle and cognitive offloading
- **Bastani et al. 2025, PNAS** (https://chibe.upenn.edu/publications/generative-ai-without-guardrails-can-harm-learning-evidence-from-high-school-mathematics, accessed 2026-11-19; PNAS page returned 403 to me): field experiment with nearly 1,000 Turkish high-school maths students in one school. A standard chat interface ("GPT Base") improved practice performance but, once access was removed, students did worse than controls (reported 17% reduction). A guardrailed version ("GPT Tutor", hints rather than answers) largely mitigated the harm. **Evidence: Moderate** (single school, one subject, 2023).
- **Kestin et al. 2025, Scientific Reports** (summary via https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/ search result, accessed 2026-11-19): Harvard physics RCT, analysis N = 316, median learning gain of AI-tutored students more than double that of in-class active learning, in less time; tutor designed on pedagogical best practices; authors stress it should not do the thinking for students. **Evidence: Moderate**, short intervention, elite students, single course.
- **De Simone et al. 2025, World Bank PRWP 11125** (https://openknowledge.worldbank.org/entities/publication/15e1ff08-15ae-4f7a-b2a8-d146e6c113ee/full, search summary): Edo State, Nigeria, RCT, GPT-4-based Copilot, six weeks, after-school English in computer labs with teacher guidance; 0.31 SD on a composite assessment, 0.23 SD on English alone. **Evidence: Moderate**, secondary school, structured setting, not independent self-study.
- **Henkel et al. 2024, Rori (Ghana)** (https://arxiv.org/abs/2402.09809): 0.36 to 0.37 SD across versions; preprint/conference; first year; **Emerging to Moderate**.
- **Cognitive offloading**: Gerlich 2025, Societies, n = 666, survey, **correlational**: more AI use associated with lower critical thinking, mediated by offloading (https://www.mdpi.com/2075-4698/15/1/6). Kosmyna et al. 2025 "Your Brain on ChatGPT" is a small, **not peer-reviewed** EEG preprint (https://arxiv.org/abs/2506.08872, n = 54 in early sessions) whose authors urge caution. Neither shows causation. **Evidence: Emerging.**
- **Reading across them:** AI tutoring helps when it is **structured and constrains answer-giving**, and can harm when it is an answer machine. The repo's Socratic harness (3-tier hint ladder, `lib/ai/prompts.ts`) points in the right direction, but I did not see enforcement outside the prompt (no "student must attempt first" gate, no logging of whether the student got the answer straight away). The Past-Question Solver is by design a worked-solution machine: valuable as worked examples (3.5), but it sells the exact thing Bastani's "GPT Base" delivered; pair every solved question with a "now try the twin" step before the next solution.
- **Fit/complexity:** Medium. Implementation: attempt-first gate for tutor; hint-escalation counters stored as evidence; measure "answer asked within 30 s of question".
- **Limits:** Gating annoys students and pushes them to Google/ChatGPT; transparent rationale and fast hints reduce that.

---

## 4. Context: Nigerian / emerging-market student

| Factor | What is known (with source) | Design consequence |
|---|---|---|
| Data cost | NCC-approved 50% tariff rise in January 2025; TechCabal estimates a 2025 average of about N575 per GB, operators N500 to N800 per GB (https://techcabal.com/2025/09/01/nigeria-data-spend-721bn-monthly/, secondary; averages are TechCabal's own). ITU/GSMA headline of about US$0.38 per GB predates the hike. | Every MB is a cost to the student. Prefer text and compressed audio; downloadable daily packs; show data size before heavy downloads; avoid auto-playing video. |
| Affordability and device | GSMA 2025: affordability, especially handsets, is the largest barrier in Sub-Saharan Africa; 60% of mobile internet users in Africa on 3G smartphones or feature phones (https://www.gsma.com/somic/wp-content/uploads/2025/11/The-State-of-Mobile-Internet-Connectivity-2025-Affordability-of-Internet-Enabled-Handsets-and-Data.pdf, primary report; the figures I quote came from press coverage (BusinessDay, Semafor), not from my reading of the PDF). | Low-end Android performance budget; small bundle; no heavy 3D/WebGL by default (Maker Studio is risky here). |
| Academic calendar disruption | ASUU strike ran 14 Feb to 14 Oct 2022, about eight months, shutting most public universities; the 2020 strike lasted about nine months (https://www.aljazeera.com/news/2022/10/14/nigerias-academic-union-ends-eight-month-strike; VOA coverage via search). | Self-study tools keep working during strikes without a lecturer; spaced schedules must tolerate calendar gaps; lecturer-led adoption is fragile when lecturers are on strike (opportunity: student-owned content). |
| Semesters | Code assumes a 4-month, 120-day term. | Term pass logic is sensible; verify with real institution calendars (private universities and polytechnics differ; not researched). |
| Lecturer-led adoption | Plausible but not sourced: lecturers control course materials and are the trusted authority. | Make the lecturer's first success fast; give them free, no-install tools. Hypothesis, validate by interviews. |
| Offline/low-connectivity precedents | Kolibri (offline-first), Eneza (SMS/USSD), uLesson (offline packs; secondary) all exist because connectivity is the constraint. | Treat offline as a core feature, not a download button. |
| Language | Igbo/Hausa noted in the code; Yoruba/Pidgin not verified. | Local-language audio is a differentiator but quality (TTS naturalness, translation accuracy) is unmeasured. |
| Cheating/assessment integrity, device sharing, power | Not researched. | Treat as open questions. |

---

## 5. Opportunities and things to skip

### 5.1 Prioritised opportunities (fit existing system, no rebuild)

| # | Opportunity | Why (evidence) | Effort | Learning vs engagement |
|---|---|---|---|---|
| 1 | **Daily "Today" session**: due FSRS cards + one weak-KC retrieval set + one interleaved set + one exam question | Retrieval, spacing (Strong) | Low-Med | Learning |
| 2 | **Exam-date-aware scheduling** (FSRS retention target from days-to-exam; cram mode) | Cepeda 2008 gap depends on retention interval (Strong) | Medium | Learning |
| 3 | **Attempt-first gate + hint-escalation logging** in tutor and solver; follow each worked solution with a twin problem | Bastani 2025 (Moderate), worked examples (Strong) | Medium | Learning |
| 4 | **Confidence tap** before reveal; feed misconception store and BKT | Hypercorrection (Moderate) | Low | Learning |
| 5 | **Lecturer weekly report**: three weakest KCs, top misconceptions, a 10-minute remedy | Formative assessment (Moderate); lecturer adoption (hypothesis) | Medium | Learning + adoption |
| 6 | **Calibrate BKT/FSRS from logs** and publish a small validation (even n = a few hundred) | ITS effect evidence does not transfer unvalidated | Medium-High | Learning, credibility |
| 7 | **Offline daily pack** with deferred evidence sync | Data cost, strikes (section 4) | Medium | Access |
| 8 | **Collapse plans to Free / Exam Pass / Semester** and hide quotas | Conversion clarity (hypothesis) | Low | Revenue |
| 9 | **Predict-before-run prompts** in the four hand-built labs | Listed "not built"; self-explanation/POE | Low | Learning |
| 10 | **Merge entry points** into Today / Library / Classes | Section 1.7 | Medium | Usability |
| 11 | **Pilot RCT or at least pre/post with one lecturer cohort** | Only way to claim learning outcomes | Medium | Credibility |

### 5.2 Attractive but skip (for now)

| Idea | Why skip |
|---|---|
| More social/game features (more pets, shop items, seasons) | No learning evidence; moderation cost; crowds out Today |
| Replacing the university LMS (full authoring, SCORM, proctoring) | Moodle/Coursera scope is huge; become the companion |
| "Cognitive Digital Twin" marketing and radar charts of competencies | Uncalibrated model; invites criticism |
| Peer matching and +40/2.0 evidence weight for peer explain | Unvalidated; farming risk |
| More AI-generated simulations in graded paths | Correctness risk; hand-verify a small set |
| AI video generation/long video lessons | Data cost; Mayer coherence; uLesson-type video is capital intensive |
| More tiers or per-feature AI quotas | Confuses payers |
| Competing with NotebookLM on generic notebook UX | Free competitor; keep it as a supporting tool |
| Claiming learning outcomes from ITS literature (0.66 SD) | Not transferable; see 3.14 |
| Voice-first tutor as a headline | Data cost, accent/ASR quality, and cheating of "answer by voice" risk, unmeasured |

---

## Open questions

1. Do BKT and FSRS share any state for a student? Is there one question bank or four? (Needs the engine audit.)
2. What proportion of AI-generated quiz items and past-question solutions are correct? Is there a measured error rate? (`qualityCheck.ts` exists; no results seen.)
3. Is the tutor hint ladder actually enforced, and do logs show whether students attempt before asking? 
4. Are BKT parameters ever fitted? What do pL values look like on real classes? Are there any real classes with real student data at all?
5. What is real willingness to pay, and what do Nigerian students actually spend on exam prep? I found no verified data.
6. Is `BILLING_ENFORCED` on in production, and how does Paystack conversion look? (Not available to me.)
7. Which institutions are using it, and are lecturers or students driving adoption? Any data-protection posture under Nigeria's NDPA 2023 (not researched)?
8. Exact current competitor prices (Duolingo, Brilliant, Quizlet, NotebookLM, Moodle, uLesson): re-verify on official pages; my fetch tool could not read them.
9. Actual offline behaviour on low-end Android (cold start, cache eviction, sync conflicts): untested by me; I did not run anything.
10. Evidence on gamification and on Nigerian-university-specific AI study products: I did not retrieve meta-analyses or a full market scan in this session.
11. Which sections of the product have child-safety or minors' data exposure (messages, feed, communities)?

