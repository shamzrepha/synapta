"use client";

import React, { useEffect, useState } from "react";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KeyInfo {
  source: "admin" | "environment" | "none";
  last4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Admin: replace the Gemini API key without a redeploy. The key is tested first and never shown again in full. */
export function AiKeySettings() {
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/admin/system/ai-key")
      .then((r) => r.json())
      .then((j) => j.ok && setInfo(j.data))
      .catch(() => null);
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const j = await fetch("/api/admin/system/ai-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).then((r) => r.json());
      if (j.ok) {
        setInfo(j.data);
        setKey("");
        setMessage({ ok: true, text: "Key tested and saved. All AI features use it now." });
      } else setMessage({ ok: false, text: j.error?.message || "Couldn't save the key." });
    } catch {
      setMessage({ ok: false, text: "Couldn't save the key." });
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const j = await fetch("/api/admin/system/ai-key", { method: "DELETE" }).then((r) => r.json());
      if (j.ok) {
        setInfo(j.data);
        setMessage({ ok: true, text: "Back to the key from the server's environment settings." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-teal-600" />
        <div className="min-w-0">
          <p className="font-bold text-sm">Gemini API key</p>
          <p className="text-xs text-slate-500">
            {info?.source === "admin" && <>In use: key ending <b translate="no">…{info.last4}</b>, set here{info.updatedBy ? ` by ${info.updatedBy}` : ""}{info.updatedAt ? ` on ${new Date(info.updatedAt).toLocaleString()}` : ""}.</>}
            {info?.source === "environment" && <>In use: key ending <b translate="no">…{info.last4}</b> from the server&apos;s environment settings.</>}
            {info?.source === "none" && "No key is set: AI features are off."}
            {!info && "Checking…"}
          </p>
        </div>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) save();
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste a new key (starts with AIza…)"
          className="flex-1 font-mono text-sm"
          aria-label="New Gemini API key"
        />
        <Button type="submit" isLoading={busy} disabled={!key.trim()}>
          Test &amp; save
        </Button>
      </form>
      <p className="text-xs text-slate-500">
        Get a key at aistudio.google.com/apikey. It&apos;s tested with one tiny request before it&apos;s used, stored only on the server, and every part of the app switches to it within a minute.
      </p>
      {message && (
        <p className={`text-xs font-semibold ${message.ok ? "text-teal-700 dark:text-teal-300" : "text-rose-600"}`} role="status">
          {message.ok && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}
          {message.text}
        </p>
      )}
      {info?.source === "admin" && (
        <button type="button" onClick={revert} disabled={busy} className="text-xs font-semibold text-slate-500 underline hover:text-slate-700">
          Remove this key and use the environment key
        </button>
      )}
    </Card>
  );
}
