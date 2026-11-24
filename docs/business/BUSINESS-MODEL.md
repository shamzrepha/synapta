# SunRootLearn business model

Written from the product as it is today. Numbers marked (assumption) must be replaced with real figures from Paystack, the AI bill and the admin usage page after the first month of paying users.

## 1. What is sold, and to whom
| Customer | Product | Price | Who decides |
|---|---|---|---|
| Student (the user) | **Student plan**: AI on their own notes, scans, lessons, practice | ₦1,500/month or ₦4,500/semester (25% off) | the student, often with a parent's money |
| Lecturer | **Teacher plan**: AI class building, grading help | ₦2,500/month or ₦7,500/semester | the lecturer |
| Department / union | **Seats** | ₦1,200/student/month or ₦3,700/semester, invoiced | HOD, class rep, union |
| Everyone | Free trial (7 days) and classes labelled **Free** | ₦0 | acquisition only |

The free tier is a trial, not a product. Free classes are the shop window: the lecturer publishes once, it costs almost nothing to serve, and every student who opens one is a lead.

## 2. Why this works
- **Content is made once, used by many.** Class lessons, podcasts and quizzes are generated once and shared, so cost does not rise with students. Only personal AI (own notes, scans) costs per user, and that is exactly what the plan limits.
- **The department is the unit of growth.** One lecturer or course rep brings 50-200 students who are all in the same room and the same WhatsApp group.
- **The price is a data bundle.** ₦1,500 is about a week of student data. ₦4,500 per semester is under ₦40 a day over a 135-day semester.

## 3. Unit economics (assumptions)
- Student plan revenue per semester: ₦4,500. Paystack fee about 1.5% + ₦100 (cap ₦2,000): about ₦170. Net ₦4,330.
- Variable AI cost per active paying student per semester: ₦700-1,200 (assumption; the plan token caps in `lib/billing/plans.ts` bound it at 1.2M tokens/month).
- Ambassador cut on first payment: 20-30%, about ₦900-1,350. Paid once, from a customer who would otherwise not have been reached.
- Contribution after AI, payment fee and a Starter-tier ambassador: roughly ₦2,300-2,700 per student per semester (about 55%). Monthly payers are worse (₦1,500 less ₦250 AI, ₦120 fee, ₦300 cut leaves about ₦830) so the semester price is the one to push: it is cheaper for them and better for us.
- Break-even: fixed costs (Hetzner, Coolify, domain, voice tools) about ₦150,000/month (assumption) need ~60 semester payers or ~180 monthly payers.

## 4. Growth engine, in order
1. **Department pilots** (the main bet). Offer a department a free week, then ₦3,700/seat/semester invoiced to the class rep or union. A pilot of 100 seats is ₦370,000 per semester from one conversation. Course reps already upload to the library, so they are the natural sellers.
2. **Ambassadors** (`/ambassador`). 20% first payment (25% from 10 paying students, 30% from 30), 10% of the next six payments, 7-day hold, ₦2,000 minimum payout. Cost of acquiring a student is capped at about 30% of first revenue and is only paid when money arrives. Do not raise the cut above 30%: at that level the margin on monthly payers disappears.
3. **Free classes shared in WhatsApp groups.** Every public class link carries the signup link.
4. **Exam-season pushes.** Past-question solver and the CBT sprint have the highest willingness to pay in the three weeks before exams; run the "semester plan" offer then.

## 5. Pricing rules to keep
- One student plan, no tiers to confuse. Add a tier only after real data shows a segment that wants more and will pay for it.
- Semester plan always visibly cheaper than 4 months of monthly.
- Never give away the thing that costs money (personal AI) for free for longer than the 7-day trial.
- Departments pay less per head than individuals; that discount is the reason a rep sells it.

## 6. Risks and what to do
| Risk | Response |
|---|---|
| Account sharing (one pays, five use) | Academic profile is locked to one department; add a concurrent-login limit before scaling past 1,000 paying users |
| AI cost spikes | Plan token caps, shared class content, cached answers, fallback models in `lib/ai` |
| Ambassador abuse | 7-day hold, self-referral blocked, verified email required, admin can void commissions |
| Payment drop-off | In-page Paystack popup, bank transfer and USSD enabled |
| Department says no | Free classes keep the foothold; sell to the course rep and students directly |

## 7. 12-month targets (assumption, adjust after month 1)
| Month | Paying students | Departments piloting | Ambassadors | Revenue/month (approx.) |
|---|---|---|---|---|
| 3 | 150 | 2 | 15 | ₦300k |
| 6 | 600 | 8 | 60 | ₦1.1M |
| 12 | 3,000 | 30 | 250 | ₦5M |

## 8. What to measure weekly
Trial-to-paid conversion (target 8-12%), semester vs monthly mix (target over 60% semester), AI cost per paying student, ambassador-sourced share of new payers, department seat utilisation (a pilot that is not used is not renewed).
