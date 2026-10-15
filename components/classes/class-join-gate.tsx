"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Globe, Users, BookOpen, Clock, KeyRound, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";

interface AccessPayload {
  canView: boolean;
  role: string;
  enrollmentStatus: "active" | "pending" | "rejected" | "none";
  class?: {
    id: string;
    title: string;
    subject: string;
    teacherName: string;
    visibility: "public" | "private";
    published: boolean;
    studentCount: number;
    description: string;
  };
  outline?: Array<{ id: string; title: string }>;
}

type Load = { state: "loading" } | { state: "error"; message: string; notFound: boolean } | { state: "ok"; data: AccessPayload };

async function fetchAccess(classId: string): Promise<Load> {
  try {
    const res = await fetch(`/api/classes/${classId}/access`);
    const j = await res.json();
    if (j.ok) return { state: "ok", data: j.data };
    return { state: "error", message: j.error?.message || "Couldn't open this class", notFound: res.status === 404 };
  } catch {
    return { state: "error", message: "Couldn't open this class. Check your connection.", notFound: false };
  }
}

/**
 * Wraps every class page. Members see the class; anyone who opened a shared link without being
 * enrolled sees this join screen instead (enroll, request to join, or join with an invite code).
 */
export function ClassJoinGate({ classId, children }: { classId: string; children: React.ReactNode }) {
  const { toast } = useToast();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [code, setCode] = useState("");
  const [inviteFromLink, setInviteFromLink] = useState(false);
  const [joining, setJoining] = useState(false);

  const refresh = useCallback(() => fetchAccess(classId).then(setLoad), [classId]);

  useEffect(() => {
    fetchAccess(classId).then(setLoad);
    const fromLink = new URLSearchParams(window.location.search).get("code");
    if (fromLink) {
      const t = setTimeout(() => {
        setCode(fromLink.toUpperCase());
        setInviteFromLink(true);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [classId]);

  if (load.state === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center space-y-3">
        <p className="font-bold text-lg">{load.notFound ? "Class not found" : "Couldn't open this class"}</p>
        <p className="text-sm text-slate-500">{load.notFound ? "The link may be wrong, or the class was deleted." : load.message}</p>
        <div className="flex justify-center gap-2">
          {!load.notFound && <Button size="sm" onClick={refresh}>Try again</Button>}
          <Link href="/explore">
            <Button size="sm" variant="outline">Browse classes</Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (load.data.canView) return <>{children}</>;

  const { data } = load;
  const c = data.class!;
  const status = data.enrollmentStatus;
  const outline = asArray(data.outline);

  const join = async (withCode: boolean) => {
    setJoining(true);
    try {
      const res = await fetch(`/api/classes/${classId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withCode && code.trim() ? { code: code.trim() } : {}),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) {
        toast({ title: "Couldn't join", description: j?.error?.message || "Please try again.", variant: "destructive" });
        return;
      }
      if (j.data.status === "active") {
        toast({ title: `Welcome to ${c.title}! 🎓`, variant: "success" });
        // Drop ?code= so the invite isn't left in the address bar
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        toast({ title: "Request sent", description: "We'll notify you when the teacher approves it.", variant: "amber" });
      }
      await refresh();
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link href="/explore" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Browse classes
      </Link>
      <Card className="p-6 md:p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {c.subject && <Badge variant="outline" className="text-xs uppercase">{c.subject}</Badge>}
          {c.visibility === "private" ? (
            <Badge variant="outline" className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Private class</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Public class</Badge>
          )}
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{c.title}</h1>
          <p className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {c.teacherName && <span>Taught by <strong className="text-slate-700 dark:text-slate-200">{c.teacherName}</strong></span>}
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.studentCount} enrolled</span>
          </p>
        </div>
        {c.description && <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{c.description}</p>}

        <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4 space-y-3">
          {!c.published ? (
            <p className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /> This class isn&apos;t open for enrollment yet. Check back soon.</p>
          ) : status === "pending" ? (
            <>
              <p className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /> Your request to join is waiting for the teacher.</p>
              <p className="text-xs text-slate-500">We&apos;ll notify you as soon as it&apos;s approved. Have an invite code? Enter it below to get in now.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">
                {inviteFromLink
                  ? "You've been invited to this class."
                  : c.visibility === "public"
                  ? "Enroll to open the lessons, quizzes, simulations and AI tutor."
                  : "This class is private. Ask to join, or use the invite code from your teacher."}
              </p>
              {status === "rejected" && <p className="text-xs text-rose-600">Your last request wasn&apos;t approved. You can ask again or use an invite code.</p>}
              <div className="flex flex-wrap gap-2">
                {inviteFromLink ? (
                  <Button onClick={() => join(true)} isLoading={joining}>Join class</Button>
                ) : c.visibility === "public" ? (
                  <Button onClick={() => join(false)} isLoading={joining}>Enroll — it&apos;s free</Button>
                ) : (
                  <Button onClick={() => join(false)} isLoading={joining}>Request to join</Button>
                )}
              </div>
            </>
          )}

          {c.published && !inviteFromLink && c.visibility === "private" && (
            <form
              className="flex gap-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) join(true);
              }}
            >
              <div className="relative flex-1">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Invite code (e.g. SYN-ABC123)"
                  maxLength={40}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm font-mono"
                  aria-label="Invite code"
                />
              </div>
              <Button type="submit" variant="outline" disabled={!code.trim() || joining}>Use code</Button>
            </form>
          )}
        </div>
      </Card>

      {outline.length > 0 && (
        <Card className="p-5 space-y-3">
          <p className="font-bold flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal-600" /> What you&apos;ll learn</p>
          <ol className="space-y-1.5">
            {outline.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-900/60 text-sm">
                <span className="h-6 w-6 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate">{t.title}</span>
                <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
