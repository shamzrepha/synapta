"use client";

import React, { useEffect, useState, useCallback } from "react";
import { KeyRound, CheckCircle2, Zap, Cpu, AlertCircle, ArrowRightLeft, Network } from "lucide-react";
import { OpenRouterSettings } from "@/components/admin/openrouter-settings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KeyInfo {
  source: "admin" | "environment" | "none";
  last4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface ProviderInfo {
  provider: "gemini" | "groq" | "openrouter";
  geminiConfigured: boolean;
  groqConfigured: boolean;
  openrouterConfigured: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Admin: AI Engine Switcher & Key Settings.
 * Allows instant 1-click toggling between Google Gemini and Groq (Llama 3.3 70B),
 * plus runtime key configuration for both providers without redeploying.
 */
export function AiKeySettings() {
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [geminiInfo, setGeminiInfo] = useState<KeyInfo | null>(null);
  const [groqInfo, setGroqInfo] = useState<KeyInfo | null>(null);

  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");

  const [busyGemini, setBusyGemini] = useState(false);
  const [busyGroq, setBusyGroq] = useState(false);
  const [busyProvider, setBusyProvider] = useState(false);

  const [geminiMessage, setGeminiMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [groqMessage, setGroqMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [providerMessage, setProviderMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadAll = useCallback(() => {
    fetch("/api/admin/system/ai-provider")
      .then((r) => r.json())
      .then((j) => j.ok && setProviderInfo(j.data))
      .catch(() => null);

    fetch("/api/admin/system/ai-key")
      .then((r) => r.json())
      .then((j) => j.ok && setGeminiInfo(j.data))
      .catch(() => null);

    fetch("/api/admin/system/groq-key")
      .then((r) => r.json())
      .then((j) => j.ok && setGroqInfo(j.data))
      .catch(() => null);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 1-Click Engine Flick Switch
  const toggleProvider = async (targetProvider: "gemini" | "groq" | "openrouter") => {
    if (providerInfo?.provider === targetProvider || busyProvider) return;
    setBusyProvider(true);
    setProviderMessage(null);
    try {
      const res = await fetch("/api/admin/system/ai-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: targetProvider }),
      });
      const data = await res.json();
      if (data.ok) {
        setProviderInfo(data.data);
        setProviderMessage({
          ok: true,
          text: `Switched active engine to ${targetProvider === "groq" ? "Groq AI" : targetProvider === "openrouter" ? "OpenRouter" : "Google Gemini"}. All AI requests now route through it${targetProvider === "openrouter" ? ", each job to its recommended model" : ""}.`,
        });
      } else {
        setProviderMessage({
          ok: false,
          text: data.error?.message || "Failed to switch AI engine.",
        });
      }
    } catch {
      setProviderMessage({ ok: false, text: "Network error switching engine." });
    } finally {
      setBusyProvider(false);
    }
  };

  // Gemini Save / Revert
  const saveGemini = async () => {
    const clean = geminiKey.trim().replace(/^["'`]|["'`]$/g, "").trim();
    if (!clean) return;
    setBusyGemini(true);
    setGeminiMessage(null);
    try {
      const j = await fetch("/api/admin/system/ai-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: clean }),
      }).then((r) => r.json());
      if (j.ok) {
        setGeminiInfo(j.data);
        setGeminiKey("");
        setGeminiMessage({ ok: true, text: "Gemini key verified and saved." });
        loadAll();
      } else {
        setGeminiMessage({ ok: false, text: j.error?.message || "Couldn't save Gemini key." });
      }
    } catch {
      setGeminiMessage({ ok: false, text: "Couldn't save Gemini key." });
    } finally {
      setBusyGemini(false);
    }
  };

  const revertGemini = async () => {
    setBusyGemini(true);
    setGeminiMessage(null);
    try {
      const j = await fetch("/api/admin/system/ai-key", { method: "DELETE" }).then((r) => r.json());
      if (j.ok) {
        setGeminiInfo(j.data);
        setGeminiMessage({ ok: true, text: "Reverted to Gemini server environment key." });
        loadAll();
      }
    } finally {
      setBusyGemini(false);
    }
  };

  // Groq Save / Revert
  const saveGroq = async () => {
    const clean = groqKey.trim().replace(/^["'`]|["'`]$/g, "").trim();
    if (!clean) return;
    setBusyGroq(true);
    setGroqMessage(null);
    try {
      const j = await fetch("/api/admin/system/groq-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: clean }),
      }).then((r) => r.json());
      if (j.ok) {
        setGroqInfo(j.data);
        setGroqKey("");
        setGroqMessage({ ok: true, text: "Groq key verified via test ping and saved." });
        loadAll();
      } else {
        setGroqMessage({ ok: false, text: j.error?.message || "Couldn't save Groq key." });
      }
    } catch {
      setGroqMessage({ ok: false, text: "Couldn't save Groq key." });
    } finally {
      setBusyGroq(false);
    }
  };

  const revertGroq = async () => {
    setBusyGroq(true);
    setGroqMessage(null);
    try {
      const j = await fetch("/api/admin/system/groq-key", { method: "DELETE" }).then((r) => r.json());
      if (j.ok) {
        setGroqInfo(j.data);
        setGroqMessage({ ok: true, text: "Groq key removed." });
        loadAll();
      }
    } finally {
      setBusyGroq(false);
    }
  };

  const currentProvider = providerInfo?.provider || "gemini";

  return (
    <div className="space-y-4">
      {/* 1-CLICK ENGINE FLICK SWITCH */}
      <Card className="p-5 border-2 border-brand-500/20 bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-foreground">Active AI Engine</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 mr-1.5 animate-pulse" />
                  {currentProvider === "groq" ? "Groq (Active)" : currentProvider === "openrouter" ? "OpenRouter (Active)" : "Gemini (Active)"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Flick between Google Gemini, Groq and OpenRouter with a single click. OpenRouter sends each job to the cheapest model that is good at it. If the active engine fails, the others with a key step in.
              </p>
            </div>
          </div>
        </div>

        {/* Engine Toggle Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          {/* Gemini Option */}
          <button
            type="button"
            disabled={busyProvider}
            onClick={() => toggleProvider("gemini")}
            className={`text-left p-4 rounded-xl border-2 transition-all relative ${
              currentProvider === "gemini"
                ? "border-brand-500 bg-brand-500/10 shadow-sm"
                : "border-border hover:border-slate-300 dark:hover:border-slate-700 bg-card/50"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className={`h-5 w-5 ${currentProvider === "gemini" ? "text-brand-600 dark:text-brand-400" : "text-muted-foreground"}`} />
                <span className="font-bold text-sm text-foreground">Google Gemini</span>
              </div>
              {currentProvider === "gemini" && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-brand-600 text-white">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Gemini 2.5 Flash, 2.5 Flash-Lite &amp; Pro models via Google AI Studio.
            </p>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`inline-block h-2 w-2 rounded-full ${geminiInfo?.source !== "none" ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-muted-foreground">
                {geminiInfo?.source !== "none" ? `Configured (…${geminiInfo?.last4 || "env"})` : "Key not set"}
              </span>
            </div>
          </button>

          {/* Groq Option */}
          <button
            type="button"
            disabled={busyProvider}
            onClick={() => toggleProvider("groq")}
            className={`text-left p-4 rounded-xl border-2 transition-all relative ${
              currentProvider === "groq"
                ? "border-amber-500 bg-amber-500/10 shadow-sm"
                : "border-border hover:border-slate-300 dark:hover:border-slate-700 bg-card/50"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className={`h-5 w-5 ${currentProvider === "groq" ? "text-amber-500" : "text-muted-foreground"}`} />
                <span className="font-bold text-sm text-foreground">Groq AI</span>
              </div>
              {currentProvider === "groq" && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Llama 3.3 70B Versatile &amp; Llama 3.1 8B Instant running at 500+ tok/sec.
            </p>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`inline-block h-2 w-2 rounded-full ${groqInfo?.source !== "none" ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span className="text-muted-foreground">
                {groqInfo?.source !== "none" ? `Configured (…${groqInfo?.last4})` : "Key not set (paste below)"}
              </span>
            </div>
          </button>

          {/* OpenRouter Option */}
          <button
            type="button"
            disabled={busyProvider}
            onClick={() => toggleProvider("openrouter")}
            className={`text-left p-4 rounded-xl border-2 transition-all relative ${
              currentProvider === "openrouter"
                ? "border-violet-500 bg-violet-500/10 shadow-sm"
                : "border-border hover:border-slate-300 dark:hover:border-slate-700 bg-card/50"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Network className={`h-5 w-5 ${currentProvider === "openrouter" ? "text-violet-500" : "text-muted-foreground"}`} />
                <span className="font-bold text-sm text-foreground">OpenRouter</span>
              </div>
              {currentProvider === "openrouter" && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-violet-500 text-white font-black">Active</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">DeepSeek, Claude, Qwen, GPT and more: the best cheap model for each job.</p>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`inline-block h-2 w-2 rounded-full ${providerInfo?.openrouterConfigured ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span className="text-muted-foreground">{providerInfo?.openrouterConfigured ? "Key set" : "Key not set (paste below)"}</span>
            </div>
          </button>
        </div>

        {providerMessage && (
          <p
            className={`text-xs font-semibold mt-3 flex items-center gap-1.5 ${
              providerMessage.ok ? "text-brand-700 dark:text-brand-300" : "text-rose-600"
            }`}
            role="status"
          >
            {providerMessage.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {providerMessage.text}
          </p>
        )}
      </Card>

      <OpenRouterSettings onChanged={loadAll} />

      {/* GROQ KEY CONFIGURATION */}
      <Card className="p-5 space-y-3 border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <Zap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground">Groq API Key</p>
            <p className="text-xs text-muted-foreground">
              {groqInfo?.source === "admin" && (
                <>In use: key ending <b translate="no" className="text-foreground">…{groqInfo.last4}</b>, set here{groqInfo.updatedBy ? ` by ${groqInfo.updatedBy}` : ""}{groqInfo.updatedAt ? ` on ${new Date(groqInfo.updatedAt).toLocaleString()}` : ""}.</>
              )}
              {groqInfo?.source === "environment" && (
                <>In use: key ending <b translate="no" className="text-foreground">…{groqInfo.last4}</b> from server environment.</>
              )}
              {groqInfo?.source === "none" && "No Groq key configured."}
              {!groqInfo && "Checking Groq status…"}
            </p>
          </div>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (groqKey.trim()) saveGroq();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder="Paste Groq key (starts with gsk_...)"
            className="flex-1 font-mono text-sm"
            aria-label="New Groq API key"
          />
          <Button type="submit" isLoading={busyGroq} disabled={!groqKey.trim()}>
            Test &amp; save Groq key
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          Get a free API key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline text-brand-600 dark:text-brand-400 font-medium">console.groq.com/keys</a>. Keys start with <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">gsk_</code>. Tested with an instant live probe before saving.
        </p>

        {groqMessage && (
          <p
            className={`text-xs font-semibold flex items-center gap-1.5 ${
              groqMessage.ok ? "text-brand-700 dark:text-brand-300" : "text-rose-600"
            }`}
            role="status"
          >
            {groqMessage.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {groqMessage.text}
          </p>
        )}

        {groqInfo?.source === "admin" && (
          <button
            type="button"
            onClick={revertGroq}
            disabled={busyGroq}
            className="text-xs font-semibold text-muted-foreground underline hover:text-foreground"
          >
            Remove this Groq key
          </button>
        )}
      </Card>

      {/* GEMINI KEY CONFIGURATION */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground">Google Gemini API Key</p>
            <p className="text-xs text-muted-foreground">
              {geminiInfo?.source === "admin" && (
                <>In use: key ending <b translate="no" className="text-foreground">…{geminiInfo.last4}</b>, set here{geminiInfo.updatedBy ? ` by ${geminiInfo.updatedBy}` : ""}{geminiInfo.updatedAt ? ` on ${new Date(geminiInfo.updatedAt).toLocaleString()}` : ""}.</>
              )}
              {geminiInfo?.source === "environment" && (
                <>In use: key ending <b translate="no" className="text-foreground">…{geminiInfo.last4}</b> from the server&apos;s environment settings.</>
              )}
              {geminiInfo?.source === "none" && "No key is set: Gemini features are off."}
              {!geminiInfo && "Checking Gemini status…"}
            </p>
          </div>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (geminiKey.trim()) saveGemini();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="Paste a new key (starts with AIza…)"
            className="flex-1 font-mono text-sm"
            aria-label="New Gemini API key"
          />
          <Button type="submit" isLoading={busyGemini} disabled={!geminiKey.trim()}>
            Test &amp; save Gemini key
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline text-brand-600 dark:text-brand-400 font-medium">aistudio.google.com/apikey</a>. Tested with a tiny probe before saving, stored securely, and used immediately across the app.
        </p>

        {geminiMessage && (
          <p
            className={`text-xs font-semibold flex items-center gap-1.5 ${
              geminiMessage.ok ? "text-brand-700 dark:text-brand-300" : "text-rose-600"
            }`}
            role="status"
          >
            {geminiMessage.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {geminiMessage.text}
          </p>
        )}

        {geminiInfo?.source === "admin" && (
          <button
            type="button"
            onClick={revertGemini}
            disabled={busyGemini}
            className="text-xs font-semibold text-muted-foreground underline hover:text-foreground"
          >
            Remove this key and use the environment key
          </button>
        )}
      </Card>
    </div>
  );
}
