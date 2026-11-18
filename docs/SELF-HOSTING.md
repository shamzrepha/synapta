# Running Sunroot on your own server (Hetzner + Coolify + Cloudflare)

This replaces Vercel's $20 a month with a server of about €5 to €15. Firebase (sign-in and Firestore) stays exactly as it is.
**Nothing here has been run on a real server yet**: follow it in order, keep Vercel running, and only switch the domain once the
test address works.

## What you need
- A Hetzner Cloud account. Server: **8 GB memory** (for example a CX or CPX plan with 8 GB, check the current price). 4 GB can run the site but the
  build can run out of memory (it did in testing); if you pick 4 GB, add 4 GB of swap (step 2).
- Your domain on Cloudflare (already done).
- The values from your Vercel project: Settings, Environment Variables (copy them; never paste them into chat).

## 1. Create the server
1. Hetzner Cloud, new server: Ubuntu 24.04, location nearest your students, add your SSH key. Turn on **Backups**.
2. Optional swap for a small server:
   `fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`
3. In Hetzner's firewall allow only ports 22, 80, 443 (and 8000 only for your own IP while you set Coolify up).

## 2. Install Coolify
Follow the one-line installer on coolify.io/docs (Installation). Open `http://SERVER-IP:8000`, create the admin account, then close port 8000.

## 3. Deploy the app
1. Coolify: New Resource, Public/Private Repository (GitHub), `shamzrepha/synapta`, branch `main`, build pack **Dockerfile**, port **3000**.
2. Environment variables (Coolify, Environment). Copy them from Vercel. Names (see `.env.example`):
   - Build-time (public, tick "Build variable"): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
     `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`,
     `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
   - Runtime (secret): `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, `GEMINI_API_KEY`,
     `OPENROUTER_API_KEY` (if used), `PAYSTACK_SECRET_KEY`, `ADMIN_EMAILS`, `BILLING_ENFORCED`, `CRON_SECRET` (make a long random one),
     `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` only if something else you use reads them, `SENTRY_DSN` if used, plus any `GEMINI_*` model overrides you set.
   - `FIREBASE_ADMIN_PRIVATE_KEY` has line breaks: paste it with `\n` for each break, the way Vercel stores it.
3. Health check path: `/api/health`. Domain for the test: `test.sunrootlearn.com` (see step 5).
4. Deploy. The first build takes several minutes.

## 4. Scheduled jobs (replace vercel.json crons)
Vercel ran two daily jobs. In Coolify, the app, **Scheduled Tasks**, add (command runs inside the container, which has `curl` and `CRON_SECRET`):

| Name | Schedule (UTC) | Command |
|---|---|---|
| Streak reminders | `0 18 * * *` | `sh -c 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/jobs/streak-reminders'` |
| Goal reminders | `0 7 * * *` | `sh -c 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/goals/reminders'` |

Optional: if you use class-session reminders (see `DEPLOY.md`), add `*/5 * * * *` with the same command for `/api/jobs/session-reminders`.

## 5. Cloudflare
1. DNS: add `test` as an **A record** to the server IP, proxy **on** (orange cloud). In Coolify set the domain to `https://test.sunrootlearn.com`.
2. Cloudflare SSL/TLS mode: **Full (strict)** (Coolify gets a certificate by itself).
3. Caching: leave the defaults (static files are cached); do not cache `/api/*`.
4. Firebase Console, Authentication, Settings, Authorized domains: add `test.sunrootlearn.com` (and later `sunrootlearn.com`, `www.sunrootlearn.com`).
5. Use the test address for about two weeks next to Vercel: sign in, read a note aloud, build a lab, make a test payment, wait for a scheduled job.

## 6. Switch over (and switch back)
1. In Cloudflare DNS point `sunrootlearn.com` and `www` at the server (A record, proxy on); set Coolify's domain to `https://sunrootlearn.com`.
2. Set `NEXT_PUBLIC_APP_URL=https://sunrootlearn.com`, redeploy; change the Paystack webhook to `https://sunrootlearn.com/api/billing/webhook`.
3. **Rollback:** point the DNS record back at Vercel. It takes minutes. Cancel Vercel only after a quiet month.

## 7. Keep it healthy
- Updates: Coolify redeploys on every push to `main`. Run `apt update && apt upgrade` on the server monthly (or turn on unattended upgrades).
- Monitoring: add a free uptime check (Uptime Kuma, or Better Stack free) on `https://sunrootlearn.com/api/health`.
- Backups: Hetzner server backups. Your data is in Firebase, so a lost server loses no student data.
- Cost watch: set a budget alert in Google Cloud for Firestore, and use the OpenRouter daily limit in Admin.

## What is different from Vercel
- No per-branch preview links, and no automatic scaling: if traffic grows past one server (around 20,000 users), add a second server behind a load balancer.
- `public/pitch/` (82 MB of videos) and `public/*.apk` are left out of the image (see `.dockerignore`). Move them to Cloudflare R2 or GitHub Releases
  and update the links before switching, or the pitch page will lose its videos.
- Rate limits are counted in the server's memory (the code does not use Redis). On one server that works better than on Vercel, where every instance counted on its own. They reset when the app restarts, and with a second server each would count separately.
- The build needs memory: 8 GB, or 4 GB plus swap.
