# Prompt for Antigravity: add the Paystack key and switch payments on

The payment code is already in the repo (merged to `main`): plans, checkout, the signed webhook, the "back from Paystack"
check, the upgrade pop-up and the admin payments page. **Your only job is to add the secret key and the two environment
settings, in the right places, without ever putting the key in git or in a log.**

## Rules
- The Paystack **secret key** goes only in `.env.local` (this machine) and in Vercel's environment variables. Never in a
  commit, a file under `public/`, a screenshot, a log line, or a chat message.
- If the user pastes a key into a chat, tell them to rotate it in the Paystack dashboard and use the new one.
- Use a **test** key (`sk_test_...`) until the pitch and first payments are verified; switch to the **live** key (`sk_live_...`) after.

## Steps
1. Pull `main`. Confirm `.env.local` is git-ignored (`git check-ignore .env.local` prints the path).
2. Ask the user to type the key into `.env.local` themselves (do not ask them to paste it to you):
   ```
   PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx
   BILLING_ENFORCED=
   ```
   Leave `BILLING_ENFORCED` empty for now.
3. Add the same two variables on Vercel for **Production and Preview** (project `sunrootlearn`):
   - Dashboard: Project > Settings > Environment Variables, or
   - CLI: `vercel env add PAYSTACK_SECRET_KEY production` (and `preview`), pasting the value when prompted.
4. In the Paystack dashboard: Settings > API Keys & Webhooks > set the **Test webhook URL** to
   `https://sunrootlearn.vercel.app/api/billing/webhook` (and the **Live webhook URL** the same, when going live).
5. Redeploy (Vercel > Deployments > Redeploy) so the new variables are picked up.
6. Test a payment as a normal (non-admin) account:
   - Open `/plans`, choose Student Plus > Monthly. Pay with Paystack's published **test card** (see Paystack docs, "Test payments").
   - You return to `/plans?paid=1` and the page says "Payment received". Your plan shows as Student Plus.
   - As an admin, open `/admin/billing`: the payment, amount, channel and subscriber should be listed.
7. When ready to enforce limits (after the pitch): set `BILLING_ENFORCED=1` on Vercel and redeploy. From then on, a free user
   who uses up their monthly allowance sees the "Time to upgrade" pop-up.
8. Going live: replace the test key with the live key on Vercel, set the live webhook URL, redeploy, and make one small real payment.

## What not to change
Prices and limits live in `lib/billing/plans.ts`. Edit them there; do not hard-code amounts anywhere else. The server
checks that every payment covers the real price, so a changed price takes effect everywhere at once.
