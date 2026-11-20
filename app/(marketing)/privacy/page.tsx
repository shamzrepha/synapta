import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy | Sunroot", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="20 November 2026">
      <p>This page explains, in plain words, what Sunroot collects about you, who we share it with, and what you can do about it. It is written for students. It is a working draft and has not been checked by a lawyer.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address (or Google sign-in), username, profile picture, school or institution, level and interests you choose to give us.</li>
        <li><strong>What you study:</strong> classes you join, answers and quiz results, mastery scores, mistakes, flashcards, notes, notebooks, exam plans, goals, and streaks.</li>
        <li><strong>What you make or upload:</strong> documents, photos of your work, questions you type to the tutor, and posts or comments you share.</li>
        <li><strong>Device and usage data:</strong> push notification tokens (if you turn notifications on), basic error reports, and how much AI you have used so we can keep limits fair.</li>
        <li><strong>Payments:</strong> if you pay, Paystack handles your card or bank details. We receive only the payment reference, plan, amount and your email.</li>
      </ul>

      <h2>Who receives your content</h2>
      <p>To answer your questions and build lessons, the text (and images) you send to our AI features is processed by outside providers. We send only what the feature needs.</p>
      <ul>
        <li><strong>Google (Gemini)</strong> and <strong>Groq</strong>: language models that write explanations, quizzes and flashcards.</li>
        <li><strong>OpenRouter</strong>: a gateway to other language models, used when the main ones are busy.</li>
        <li><strong>Microsoft Edge text-to-speech</strong>: turns text into audio when you use read-aloud.</li>
        <li><strong>ElevenLabs</strong> (only if switched on for your account or class): higher-quality voices.</li>
        <li><strong>Firebase / Google Cloud</strong> stores your account and data. <strong>Vercel</strong> hosts the app. <strong>Paystack</strong> processes payments.</li>
      </ul>
      <p>We do not sell your data and we do not show you third-party ads. Please do not put passwords, bank details or other very sensitive information into AI features.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and learning data stay until you delete your account.</li>
        <li>When you delete your account we remove your learning data, notes, notebooks you own, flashcards, friends, notifications and posts. Comments you wrote in other people&apos;s threads are kept but made anonymous.</li>
        <li>Payment records are kept for accounting and legal reasons, with your name and email removed.</li>
        <li>Backups and logs may take some time to age out after deletion.</li>
      </ul>

      <h2>Your rights (Nigeria Data Protection Act 2023)</h2>
      <p>You can ask to:</p>
      <ul>
        <li><strong>See your data.</strong> Settings, Privacy and data, Download my data.</li>
        <li><strong>Correct it.</strong> Edit your profile in the app, or write to us.</li>
        <li><strong>Delete it.</strong> Settings, Privacy and data, Delete my account.</li>
        <li>Object to or ask us to limit how we use your data, by writing to us.</li>
      </ul>
      <p>You may also complain to the Nigeria Data Protection Commission.</p>

      <h2>Children and age</h2>
      <p>You should be 16 or older to use Sunroot on your own. If you are younger, a parent or guardian must agree. We ask you to confirm this when you set up your profile.</p>

      <h2>Contact</h2>
      {/* TODO: confirm privacy@sunrootlearn.com exists and is monitored before launch */}
      <p>Questions or requests: <a href="mailto:privacy@sunrootlearn.com">privacy@sunrootlearn.com</a> <span className="text-xs text-muted-foreground">(TODO: confirm this address before launch)</span></p>
      <p>See also our <Link href="/terms">Terms of Use</Link>.</p>
    </LegalPage>
  );
}
