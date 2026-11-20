import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Use | Sunroot", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="20 November 2026">
      <p>These are the rules for using Sunroot. They are a working draft and have not been checked by a lawyer.</p>

      <h2>Using Sunroot</h2>
      <ul>
        <li>You must be 16 or older, or have a parent or guardian who agrees.</li>
        <li>Keep your login to yourself. You are responsible for what happens on your account.</li>
        <li>Give true information when you sign up.</li>
      </ul>

      <h2>Be decent</h2>
      <ul>
        <li>No cheating tools, spam, harassment, hate, or content that breaks the law.</li>
        <li>Only upload material you have the right to use. Your teacher&apos;s or school&apos;s materials stay theirs.</li>
        <li>Do not try to break, overload or reverse-engineer the service.</li>
      </ul>

      <h2>AI answers can be wrong</h2>
      <p>Sunroot uses AI. It can make mistakes. Check important facts against your textbook or teacher, and do not rely on it for medical, legal or exam-board decisions.</p>

      <h2>Your content</h2>
      <p>What you create stays yours. You allow us to store it and send it to the providers listed in the <Link href="/privacy">Privacy Policy</Link> so the features work for you.</p>

      <h2>Paid plans</h2>
      <p>Paid plans are processed by Paystack. Prices and plan length are shown before you pay. Contact us if something went wrong with a payment.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account any time in Settings. We may suspend accounts that break these rules.</p>

      <h2>Changes and contact</h2>
      {/* TODO: confirm privacy@sunrootlearn.com before launch */}
      <p>We may update these terms and will say so in the app. Questions: <a href="mailto:privacy@sunrootlearn.com">privacy@sunrootlearn.com</a> <span className="text-xs text-muted-foreground">(TODO: confirm this address before launch)</span></p>
    </LegalPage>
  );
}
