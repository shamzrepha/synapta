"use client";

import React, { useState } from "react";
import { MailCheck } from "lucide-react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/components/providers/auth-provider";
import { clientAuth } from "@/lib/firebase/client";

/** Shown to email/password accounts until they confirm their address; posting publicly waits for it. */
export function VerifyEmailBanner() {
  const { firebaseUser } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!firebaseUser || done || firebaseUser.emailVerified || !firebaseUser.email) return null;
  if (!firebaseUser.providerData.some((p) => p.providerId === "password")) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await sendEmailVerification(firebaseUser);
      setStatus(`Sent. Check ${firebaseUser.email} (and spam).`);
    } catch {
      setStatus("Couldn't send just now. Wait a minute and try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const user = clientAuth().currentUser;
      if (!user) return;
      await user.reload();
      if (!user.emailVerified) {
        setStatus("Not verified yet. Open the link in the email first.");
        return;
      }
      // the session cookie carries the verified flag, so mint a fresh one
      const idToken = await user.getIdToken(true);
      await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      setDone(true);
    } catch {
      setStatus("Couldn't check right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
      <MailCheck className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 min-w-[12rem]">
        Confirm your email to post, comment and message. {status && <span className="font-medium">{status}</span>}
      </span>
      <button type="button" onClick={resend} disabled={busy} className="rounded-lg border border-amber-400 px-3 py-1.5 font-semibold hover:bg-amber-100 disabled:opacity-60 dark:hover:bg-amber-900/40">
        Resend email
      </button>
      <button type="button" onClick={confirm} disabled={busy} className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
        I’ve verified
      </button>
    </div>
  );
}
