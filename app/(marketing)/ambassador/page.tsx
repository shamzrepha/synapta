import type { Metadata } from "next";
import Link from "next/link";
import { founderPerson, organizationNode } from "@/lib/founder";
import { SITE_DESCRIPTION, getSiteUrl } from "@/lib/site";
import { RENEWAL_RATE, RENEWAL_PAYMENTS_PAID, HOLD_DAYS, MIN_PAYOUT_NGN, TIERS, commissionFor } from "@/lib/ambassador/commission";

export const metadata: Metadata = {
  title: "Become a SunRootLearn Ambassador",
  description: "Share SunRootLearn with your coursemates and earn a cut of every payment. Free to join, paid to your bank account.",
  alternates: { canonical: "/ambassador" },
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const STUDENT_MONTH = 1_500;
const STUDENT_TERM = 4_500;

export default function AmbassadorPage() {
  const siteUrl = getSiteUrl();
  const graph = [
    { "@context": "https://schema.org", "@type": "WebPage", "@id": `${siteUrl}/ambassador#webpage`, url: `${siteUrl}/ambassador`, name: "SunRootLearn Ambassador program", description: metadata.description, isPartOf: { "@id": `${siteUrl}/#organization` }, publisher: { "@id": `${siteUrl}/#organization` } },
    { "@context": "https://schema.org", ...organizationNode(siteUrl, SITE_DESCRIPTION) },
    { "@context": "https://schema.org", ...founderPerson(siteUrl) },
  ];
  const examples = [
    { who: "5 coursemates on the monthly plan", n: 5, price: STUDENT_MONTH },
    { who: "20 coursemates on the semester plan", n: 20, price: STUDENT_TERM },
    { who: "a whole class of 60 on the semester plan", n: 60, price: STUDENT_TERM },
  ].map((e) => {
    let total = 0;
    for (let i = 0; i < e.n; i++) total += commissionFor(e.price, 1, i);
    return { ...e, total };
  });
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }} />
      <Link href="/" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">&larr; SunRootLearn</Link>
      <section className="mt-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Ambassador program</p>
        <h1 className="mt-3 max-w-[18ch] text-[clamp(2.4rem,6vw,4.5rem)] font-medium leading-[1] tracking-[-0.03em]">Your coursemates need it. <em className="font-serif font-normal italic text-brand-600 dark:text-brand-400">Get paid</em> for showing them.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">Share your personal link. When a coursemate joins and pays, a cut of their payment goes straight to your bank account. No target, no fee, no stock to carry.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/ambassador/dashboard" className="inline-flex h-12 items-center rounded-md bg-brand-500 px-6 text-sm font-semibold text-slate-950 hover:bg-brand-400">Get my link</Link>
          <Link href="/signup" className="inline-flex h-12 items-center rounded-md border border-border px-6 text-sm font-semibold hover:bg-muted">Create an account first</Link>
        </div>
      </section>

      <section className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
        {[
          ["1. Get your link", "Sign in, open Ambassador, and copy your link or a ready-made WhatsApp message."],
          ["2. They join and try it", "Everyone gets a 7-day free trial, so it is an easy yes. Classes marked Free stay free."],
          ["3. They pay, you earn", `You earn on their first payment and on their next ${RENEWAL_PAYMENTS_PAID}. Add your bank details once and we pay you.`],
        ].map(([t, b]) => (
          <div key={t} className="bg-background p-6"><h2 className="text-lg font-medium">{t}</h2><p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{b}</p></div>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-medium tracking-tight">The more you bring, the more you keep</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.name} className="rounded-xl border border-border p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{t.name}</p>
              <p className="mt-2 text-3xl font-medium">{Math.round(t.rate * 100)}%</p>
              <p className="mt-1 text-sm text-muted-foreground">of a first payment{t.from ? `, from ${t.from} paying students` : ", from the start"}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Then {Math.round(RENEWAL_RATE * 100)}% on each of their next {RENEWAL_PAYMENTS_PAID} payments, at every level.</p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-medium tracking-tight">What that looks like</h2>
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {examples.map((e) => (
            <li key={e.who} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
              <span>{e.who}</span>
              <span className="text-xl font-medium">{naira(e.total)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">First payments only, before renewals. Plans: Student {naira(STUDENT_MONTH)} a month or {naira(STUDENT_TERM)} a semester.</p>
      </section>

      <section className="mt-14 space-y-3">
        <h2 className="text-2xl font-medium tracking-tight">The fine print, plainly</h2>
        <ul className="space-y-2 text-[15px] leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc">
          <li>Earnings are held for {HOLD_DAYS} days after each payment, then become payable.</li>
          <li>Payouts are by bank transfer once you have {naira(MIN_PAYOUT_NGN)} or more payable.</li>
          <li>You cannot earn from your own account or from accounts you make yourself. We may withhold commission on abuse.</li>
          <li>You may say you are an ambassador. You may not claim to be Sunroot staff or promise results the product does not give.</li>
          <li>Class reps: this is on top of your normal rep work, and it is separate from the department library.</li>
        </ul>
      </section>

      <section className="mt-14 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-medium">Own a student union, department or study group?</h2>
        <p className="mt-2 text-[15px] text-muted-foreground">Departments can join together for {naira(1_200)} per student per month or {naira(3_700)} per semester, billed by invoice. <Link href="/plans" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Ask for a department pilot</Link>.</p>
      </section>
    </main>
  );
}
