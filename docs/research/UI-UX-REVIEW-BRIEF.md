# SunRootLearn: UI/UX map and research brief (paste this whole file into ChatGPT)

## 0. YOUR TASK (read first)
You are a senior product designer with a background in educational psychology. Below is a complete map of the SunRootLearn web app (every page, nav element and main button). Do three things:

1. **Research** the educational-psychology and HCI evidence that applies to a study app for Nigerian secondary and university students (phone-first, often on weak data). Cover at least: cognitive load theory, spaced repetition and retrieval practice, self-determination theory (autonomy, competence, relatedness), growth mindset, goal-setting, gamification and its risks (over-justification, streak anxiety), attention and multitasking, dual coding, worked examples, feedback timing, onboarding, and age-appropriate design for under-18s. Cite sources (author, year, venue). Mark which findings are strong and which are weak or contested.
2. **Audit** the app against standard app patterns (iOS Human Interface Guidelines, Material 3, Nielsen's 10 heuristics, WCAG 2.2 AA, Fitts's law for thumb reach, Hick's law for choice overload). Go page by page. Do not skip any page or button in section 3 to 9. If a page is fine, say "ok" and why in one line.
3. **Recommend**. For every problem: page, what is wrong, the evidence that says it matters, the exact change (label, placement, count of items, order), and effort (S/M/L). End with a ranked top-15 list and a proposed simplified navigation.

Output format: (a) 10-line executive summary, (b) research summary with citations, (c) page-by-page audit table, (d) ranked top 15, (e) proposed navigation and Home screen wireframe in text, (f) things NOT to change and why.
Be specific and blunt. No generic advice ("improve contrast") without naming the screen and element.

## 1. Product in one paragraph
SunRootLearn (brand "Sunroot", mascot "Sprout", a plant) turns a student's own material (PDF, photo, scan, class notes) into notes, quizzes, flashcards, practice and a read-aloud lesson, and adds classes with teachers, social study, a maker lab and rewards. Audience: students (default role), teachers, admins; also schools. Money: free plan plus Exam Pass, Plus, Pro, Teacher plans, school seats (Naira, Paystack). Stack: Next.js web app, also a thin Android shell that loads the site.

## 2. Design rules already in place (do not contradict without a reason)
- Blue (`brand-*`) = every action, link, selection, mastery. Gold = rewards only (XP, streak, badges), never a button. Green = correct/saved. Red/coral = needs attention (always with icon or words). Neutrals tinted navy. Mastery shown by lightness plus hatching plus a number, not hue alone.
- Instrument Sans body, Instrument Serif italic accent word on landing, IBM Plex Mono for small labels. Small radii (controls 6px, cards 8px). Shadows only on floating layers. All motion respects reduced-motion.
- 18 colour themes (boys, girls, neutral, light and dark) change backgrounds and brand colour everywhere. Theme button is in the top bar.
- Principle: one primary action per screen; tables become cards on phones; everything starts from "Add material".

## 3. App shell (on every logged-in page)
**Desktop (md and up):** left **Sidebar** (collapsible) plus **Topbar**. **Phone:** Topbar plus **bottom bar** of 5.
- **Sidebar**: logo; button "Add material" (opens menu: upload notes or scan, snap homework, chat with a document, ask the tutor; teachers also "create a class"); main group Home, My classes, Study & labs, Community; account group Saved, Profile, All features, Admin Console (admins only); collapse/expand toggle. Active item stays highlighted while inside child routes.
- **Bottom bar (phone)**: Home, Classes, centre "+" (Add material), Study, Community. Saved, Profile, All features, Plans and Admin are in the account menu. Safe-area padding for gesture bars.
- **Topbar** (left to right): Back button (only on non-root pages; root pages are Home, My classes, Explore, Study, Community, Profile, All features, Saved); logo mark (phone, root pages); "Search or jump to anything" button (opens command palette, Ctrl/Cmd+K; lists suggestions first, then every feature the role may use); theme button (opens theme menu, 18 themes plus light/dark); level pill (level, title, XP, XP to next level on hover); streak pill (days, links to /streak); Messages icon with unread count (links /messages); Account menu (profile, settings, saved, plans, sign out, etc.).
- Banners: verify-email banner, app-update banner (new version available), site notice, offline indicator.
- **Sprout** (floating mascot): sits on screen, can be dragged, reacts to events, perches on words during read-aloud, can be switched off in Settings.
- First-run tour (3 steps, skippable, replay in Settings). Animated favicon (Sprout) in the browser tab.
- Floating overlay calculator (Texas-Instruments-style display, not a text box).

## 4. Public and auth pages
- **Landing `/`**: hero with animated engine/pixel field; sections explaining notes-from-your-material, practice, classes, labs, community, pricing; school registration section; footer links (About, Privacy, Terms). Signed-in returning users are redirected to the app (cookie `sr_seen`).
- `/about`, `/privacy`, `/terms`.
- **Auth** `/login`, `/signup`: email and Google sign-in; role choice; terms consent; forgot password; profile-setup step after first sign-in (display name, avatar choice or upload, level/school, goals).
- `/r/[token]`: shared weekly report card (read-only link a parent can open).

## 5. Student pages (grouped as the app groups them)

### 5.1 Home `/dashboard`
Greeting plus streak; **Continue where I left off** card (reader position); **Quick actions** grid of 8 tiles (My classes, Flashcards with due badge, Quick quiz, Written practice, Notes from PDF, Past questions, Ask the tutor, My progress); **Today's goals** (checkable, daily-goal progress); **Your classes** list (Start, See all, Find a class); mastery radar and adaptive strip; campus streak banner; "what is happening around you" (events, schedule and notify class for teachers).

### 5.2 Classes
- `/classes/manage` **My classes** (tabs: my classes, find a class): list of enrolled classes, "Join with code", "Create notes instead" (empty state), teachers: create class.
- `/explore` **Find a class**: search and filters, class cards (View Syllabus, join), teachers: "Create Class & Launch Studio" modal.
- `/classes/[id]` **Class home**: header, Continue reading, Syllabus and topics list (Open topic), assignments, schedule and notify class (teacher), announcements, save.
- `/classes/[id]/read` **Reader** (see section 6). `/syllabus`, `/topics/[kcId]` (lesson with Generate lesson, Generate flashcards, flashcard feedback I got it / Not yet, Start quiz, Check answer, full-screen, add notes, teacher edit), `/map` (learning map for the course with goal modal), `/diagnostic` (baseline quiz, Next Question), `/assignments` (generate), `/past-questions` (computer-based test practice, Written practice), `/heatmap` (class mastery heatmap, teacher), `/manage` (pending join requests, roster), `/manage/content` (Curriculum Content Studio: generate, edit).
- `/classes/announcements`, `/classes/heatmap` (choose class), `/sessions` (live sessions, schedule and notify).

### 5.3 Study hub `/study` (tabs/hub; also Labs)
"Start with these" large cards, then compact rows grouped by intent: Capture, Learn, Practice, Plan, Build, Rewards. Pages:
- `/study/notes` **Study notes** (create, upload PDF, camera, print, quiz of the note, written practice, upgrade prompt), `/study/snap` **Snap homework**, `/study/flashcards` (decks, review: Show answer, rate), `/study/daily` **Daily 5-minute challenge** (Next question, See results, Review your mistakes), `/study/papers` **Past-paper mode** (timed, AI-marked, history), `/study/mistakes` **Mistake notebook** (retest), `/study/mindmap` **Mind-map maker** (saved maps), `/study/exams` **Exam countdown planner** (add exam, Build my plan, reschedule), `/study/evaluation` **How am I doing?**
- `/practice/written` **Written practice** (answer in own words, AI marks against a guide, Try another question).
- `/notebook` **AI Notebook / Research Notebook** (create notebook, index and add source, chat with sources, regenerate, share with friends as editor/viewer).
- `/tutor` **AI Tutor** (chat), `/tutor/voice` **Voice tutor** (hands-free).
- `/worlds`, `/worlds/new`, `/worlds/[id]`, `/learn`, `/node/[nodeId]`, `/review` **My Worlds**: upload notes, merge into one library, concept map of nodes, practice per node, spaced review.
- `/for-you` **For you** ranked next-best-activity cards (Done, Skip, Too hard, Too easy, Do 3 more, Change or switch off) and `/my-learning-map` **My learning map** (the personal "Learner Mirror": how you study, what is collected, reset, off by default).
- `/goals` **Goal tracker** (Build my plan), `/focus`, `/focus/[code]`, `/focus/stats` **Focus rooms** (Pomodoro, create/join room, stats), `/offline` (downloads), `/activity` (study heatmap).
- **Maker Studio / Labs**: `/studio` (Start a guided build, Maker Wall, Contests), `/studio/new` (plan a build), `/studio/[id]` (design: upload, share, publish, build guide, challenge entry), `/studio/[id]/guide` (parts, safety checklist, wiring table, print), `/studio/shop` (parts shop, tray, plan a build), `/studio/debug` (photo of circuit, past diagnoses), `/studio/path` and `/studio/path/[id]` (learning paths), `/studio/wall` and `/studio/wall/[id]`, `/studio/contests` and `/studio/contests/[id]`; `/experiments` and `/experiments/[id]` (chemistry and physics simulators with Controls, Results, Data table, saved runs).

### 5.4 Community `/community` (hub: "Start with these")
`/feed` (post, load more), `/messages` (find people, new chat), `/friends` (search, add), `/groups` and `/groups/[id]` (create/join, shared notebook, merge conflict dialog), `/ask` (anonymous ask, reply), `/tutors` (peer tutoring profile, XP for answers), `/mentors` (mentor matching, requests accept/decline), `/polls`, `/shoutouts` (send badge), `/explainers` and `/explainers/mine` (60-second videos), `/communities` and `/communities/[id]` (school communities), `/lounge` and `/lounge/[roomCode]` (study rooms), `/challenges` and `/challenges/[eventId]` (duels, build challenges), `/leaderboard` (weekly XP, hall of fame), `/u/[ref]` (public profile: posts, send shout-out), `/search`.

### 5.5 Rewards, account
`/streak` (streak by learning points, last 30 days, history, freezes), `/quests` (daily and seasonal, Claim reward), `/shop` (XP shop, purchase history, dress up Sprout), `/pet` (Sprout wardrobe, Save), `/report` (weekly report card, create/revoke share link), `/saved`, `/notifications`, `/profile` (profile and skill map, edit, request teacher access), `/settings` (theme, language, data saver, offline downloads, notifications, privacy and data export/delete, tour replay, Sprout on/off, links to Privacy and Terms), `/plans` (current plan, usage, upgrade, payments, department request at N1,200 per student per term), `/schools` (school pass, principal portal, inter-university championship), `/more` **All features** (every feature grouped Study, Practice, Build and labs, Community, Teach, Account).

## 6. The Reader (most used screen), `/classes/[id]/read`
- Page layout looks like a real notebook page: **fixed number of ruled lines per page**, page-turn arrows ("Turn to previous/next page"), page tabs, flip-through control, headings, tables (scroll sideways), images, definitions.
- **Read along**: offer pop-up "Ready to read with me?" with pace choice; controls region "Listening controls": previous topic, play/pause, next topic, stop, speed cycle. Voice: neural female voice. Current word highlights; **Sprout hops along and stands on the word being read**; page flips automatically at page end; scrolling pauses the lock. Switch to the text view or stop at any time.
- End-of-topic: "Practice this topic", "Open my learning map", "Back to the class", "I got it / Not yet" self-check, view class map.
- Known weak points: voice and Sprout can drift; Overview/definition blocks; overlay controls hard to reach with one thumb.

## 7. Teacher pages
`/teach/plans` (AI lesson plans, save, print), `/teach/grading` (short-answer sets, create question set, auto-grading with override), `/teach/grading/take/[id]` (student taking a set), `/teach/attendance` (open/close check-in, report, past check-ins), class tools in 5.2 (create class, manage roster, join requests, content studio, announcements, heatmap, schedule and notify), Quick-action tiles for teachers: My classes, Create class, Lesson plans, Grade work, Attendance, Announcements, Make notes.

## 8. Admin pages (admins only)
`/admin` Platform Operations Console (self-test, AI provider keys and models, AI spend and daily cap, voice settings, site notice, users, moderation), `/admin/billing` (payments and subscribers), `/admin/controls` (site controls and feature switches).

## 9. Cross-cutting behaviours to audit
- Empty states, loading skeletons, error pages, offline page and data-saver mode.
- Plan limits and upgrade prompts (where and how often they interrupt).
- Notifications (in-app, push), email verification gate, parental-consent and privacy for under-18s.
- Streak (earned by learning points, not just logging in), XP, levels, badges, weekly leaderboard, shout-outs: assess motivational design and anxiety risk.
- Accessibility: keyboard focus, screen-reader labels, colour-blind safety, reduced motion, tap-target sizes (44px), text scaling, dark mode.
- Information architecture: 4 bottom tabs plus "All features" holds about 60 features. Judge discoverability, naming (e.g. "Study & labs", "Community", "Worlds", "Learning map", "For you"), and where duplicates or overlaps exist (Notes vs Notebook vs Worlds; Flashcards vs Daily vs Mistakes; Tutor vs Voice tutor vs Ask).

## 10. Questions I most want answered
1. Is the navigation (4 tabs plus Add) the right size for about 60 features? What would you cut, merge or rename?
2. What should Home show in the first 5 seconds for a first-time student versus a returning student at exam time?
3. Which gamification elements help learning and which risk harm for teens?
4. How should read-along, notes and practice be sequenced into a daily loop?
5. Where do we overwhelm (Hick's law) and where is thumb reach poor on a 6-inch phone?
6. What does a trustworthy, standard-feeling app look like for parents, teachers and schools buying seats?
