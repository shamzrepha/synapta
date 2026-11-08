# Sunroot (shamzrepha/synapta)

Next.js 16 App Router, React 19, Firebase (Auth + Firestore), Gemini and Groq through `lib/ai`, Paystack, Vercel (main auto-deploys).

- **Before every push:** `npx tsc --noEmit`, `npx eslint .` (0 errors), `npx vitest run`, `npm run check:guards`, `npm run check:models`.
- **AI:** add work as a task in `lib/ai/tasks.ts` and call `generateWithFallback`; never hardcode a Gemini model name outside `lib/ai` (CI fails it).
- **API routes:** `requireUser` (or `requireUser(req, ["admin"])`), zod-validate the body, rate-limit what costs money. `app/api/route-guards.test.ts` fails CI if a route lacks a guard.
- **Secrets:** only in `.env.local` and Vercel. Never in git, logs or chat.
- **Design:** follow `.claude/skills/anti-slop-playbook/SKILL.md`.
- **Do not commit:** `AGENTS.md` changes made by `next dev`, third-party packages under `.agent/` (they are excluded from lint, tests and tsc), APK files in `public/` (use GitHub Releases).
- **Native Android app:** lives in a separate `sunroot-mobile` project; see `docs/antigravity/APP-AUTO-UPDATE.md`.
