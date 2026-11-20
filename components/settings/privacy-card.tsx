"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from "firebase/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clientAuth, googleProvider } from "@/lib/firebase/client";
import { useUserStore } from "@/lib/store/use-user-store";

/** Settings > Privacy and data: download everything we hold about you, or delete the account. */
export function PrivacyCard() {
  const username = useUserStore((s) => s.user?.username) || "";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");

  const user = clientAuth().currentUser;
  const usesPassword = !!user?.providerData.some((p) => p.providerId === "password");

  async function download() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/me/export");
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setMsg(j?.error?.message || "Couldn't prepare your data. Try again later.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "sunroot-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMsg("");
    try {
      const u = clientAuth().currentUser;
      if (!u) throw new Error("Please sign in again.");
      // The server only deletes accounts that signed in within the last few minutes.
      if (usesPassword && u.email) await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
      else await reauthenticateWithPopup(u, googleProvider);
      const token = await u.getIdToken(true);
      const res = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: typed }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg(j?.error?.message || "Couldn't delete the account. Nothing was lost; try again.");
        return;
      }
      await clientAuth().signOut().catch(() => null);
      window.location.href = "/";
    } catch (e) {
      setMsg(e instanceof Error && /password|credential/i.test(e.message) ? "That password didn't match." : "Couldn't confirm it's you. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const ready = typed.trim().toLowerCase().replace(/^@/, "") === username.toLowerCase() && username !== "" && (!usesPassword || password.length > 0);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-brand-600" />
        <h2 className="text-sm font-bold">Privacy and data</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        See what we keep in our <Link href="/privacy" className="underline">Privacy Policy</Link> and <Link href="/terms" className="underline">Terms</Link>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void download()} isLoading={busy && !confirming}>
          <Download className="mr-1.5 h-4 w-4" /> Download my data
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)} className="text-rose-600">
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete my account
        </Button>
      </div>
      {msg && <p role="alert" className="text-xs font-semibold text-rose-600">{msg}</p>}

      {confirming && (
        <div role="dialog" aria-modal="true" aria-label="Delete my account" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="text-base font-bold">Delete your account?</h3>
            <p className="text-sm">This permanently removes your progress, notes, flashcards, friends and profile. It cannot be undone. Download your data first if you want a copy.</p>
            <label className="block text-xs font-semibold">
              Type your username (<span translate="no">{username || "…"}</span>) to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </label>
            {usesPassword && (
              <label className="block text-xs font-semibold">
                Your password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </label>
            )}
            {msg && <p role="alert" className="text-xs font-semibold text-rose-600">{msg}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setConfirming(false); setMsg(""); }}>Cancel</Button>
              <Button type="button" size="sm" disabled={!ready || busy} isLoading={busy} onClick={() => void remove()} className="bg-rose-600 text-white hover:bg-rose-700">
                Delete forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
