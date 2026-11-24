# Ambassador program

Rules live in `lib/ambassador/commission.ts` (one source for the public page, the dashboard and the payout).

- Link: `https://sunrootlearn.com/signup?ref=<username>`. The signup page already stores `?ref` and `/api/referrals` links the new account to the ambassador (`referredBy`).
- Every payment in `activatePayment` writes a `commissions/{reference}` doc for the referrer: 20% of the first payment (25% from 10 paying students, 30% from 30), then 10% of the next six payments.
- Each commission is held 7 days, then payable. Minimum payout ₦2,000.
- Ambassadors enter bank details at `/ambassador/dashboard`. Admin pays by bank transfer and presses *Mark paid* at `/admin/ambassadors`.
