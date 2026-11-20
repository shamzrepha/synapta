# Navigation audit: taps from Home for a first-time student

Taps counted from the dashboard on a phone, starting with no saved state. "Before" is the shell at commit 5f1ff90; "After" is this change.

| # | Action | Before | After | How, after |
|---|--------|--------|-------|------------|
| 1 | Open my class | 2 (Classes tab, class) | 1 | Quick actions "My classes" (or class list on Home: 1) |
| 2 | Continue reading | 3+ (Classes, class, Read) | 1 | "Continue where I left off" card (uses the reader's saved position) |
| 3 | Take a quiz | 3+ (Classes, class, topic) | 1 | "Quick quiz" tile (daily 5 questions); class quizzes still 3 |
| 4 | Review flashcards | 3 (Study, tools list, Flashcards) | 1 | "Flashcards" tile with due badge |
| 5 | Written practice | 3+ (only via All features) | 1 | "Written practice" tile |
| 6 | Notes from a PDF/photo | 1-2 (+ button, Upload) | 1 | "Notes from PDF" tile (the + button stays 2) |
| 7 | Past questions | 3 (Study, tools, Past papers) | 1 | "Past questions" tile |
| 8 | Labs | 2 (Study, Maker Studio) | 2 | Study tab, Maker Studio; also Jump to > "Labs and studio" (2) |
| 9 | Ask the tutor | 1-2 (+ button, Ask the tutor) | 1 | "Ask the tutor" tile |
| 10 | My progress / mastery | 3+ (Study, Review weak topics) | 1 | "My progress" tile |
| 11 | For you feed | 3+ (not in any menu) | 2 | Jump to (suggested list), or All features > Study |
| 12 | Settings / theme | 2 (account menu, theme button) | 2 | Theme button is 1 tap; Settings via account menu or All features > Account |

Teachers: My classes, Create class, Lesson plans, Grade work, Attendance, Announcements and Make notes are 1 tap (before 2 to 3+).

## What changed
- Dashboard: Quick actions grid (8 tiles per role) and Continue card, built from `lib/nav/quick-actions.ts` and `lib/nav/resume.ts`.
- Topbar: a persistent "Jump to" button opens the command palette, which now lists suggestions first and every live feature the role may use.
- All features (/more): grouped Study, Practice, Build and labs, Community, Teach (teachers only), Account; one entry per page (`lib/nav/more-groups.ts`). Routes are untouched; only the list lost repeats (Team builds, Export designs and Data-saver pointed at pages already listed).
- Mobile bar: still Home, Classes, Add, Study, Community (5 slots). "Notebook & Studio" is now "Study & labs"; "Everything" is "All features".
- First-run tour: three steps, skippable, once per account per device (localStorage key `sunroot.tour.v1.<uid>`); replay from Settings, "Show me around".
- Empty states: no class (Join with code, Create notes), no flashcards (Make some from notes).

## Still 3+ taps
Class quizzes inside a topic, and Settings sub-pages, remain inside their own flows.
