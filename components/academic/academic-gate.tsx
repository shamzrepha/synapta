"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/api/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { INDEPENDENT_NAME } from "@/lib/academic/academic";

interface School { id: string; name: string; short: string; departments: string[] }
interface Inst { id: string; name: string; maxLevel: number; verified: boolean; schools: School[] }
interface Info { academic: { institution: string; school: string; department: string; level: number } | null; locked: boolean; pendingRequest: boolean; levels: number[]; institutions: Inst[] }

const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

/**
 * The course picker: school (search), then, for a school in our list, its faculty, department and level.
 * Used twice: as a full-screen step a new student must finish, and inside a change request.
 */
export function AcademicForm({ info, onSubmit, busy, submitLabel, withReason }: { info: Info; onSubmit: (v: { institutionId: string | null; institution: string; unlisted?: boolean; school: string; department: string; level: number; reason?: string }) => void; busy: boolean; submitLabel: string; withReason?: boolean }) {
  const [q, setQ] = useState("");
  const [instId, setInstId] = useState<string | null | undefined>(undefined); // undefined = not chosen, null = another school
  const [other, setOther] = useState("");
  const [school, setSchool] = useState("");
  const [dept, setDept] = useState("");
  const [level, setLevel] = useState(0);
  const [reason, setReason] = useState("");
  const [indep, setIndep] = useState(false);
  const [unlisted, setUnlisted] = useState(false);

  const matches = useMemo(() => info.institutions.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())), [info.institutions, q]);
  const inst = info.institutions.find((i) => i.id === instId) ?? null;
  const sch = inst?.schools.find((s) => s.name === school) ?? null;
  const levels = info.levels.filter((l) => !inst || l <= inst.maxLevel);
  const ready = indep ? level > 0 : (inst ? !!sch && dept.trim().length > 1 : other.trim().length > 1 && dept.trim().length > 1) && level > 0 && (!withReason || reason.trim().length >= 5);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-semibold" htmlFor="acad-school-search">Your school</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input id="acad-school-search" className={`${field} pl-9`} placeholder="Search your university" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto" role="listbox" aria-label="Schools">
          {matches.map((i) => (
            <li key={i.id}>
              <button type="button" role="option" aria-selected={instId === i.id} onClick={() => { setIndep(false); setInstId(i.id); setSchool(""); setDept(""); setLevel(0); }} className={`min-h-[44px] w-full rounded-lg border px-3 text-left text-sm ${instId === i.id ? "border-brand-600 bg-brand-600/10 font-semibold" : "border-border hover:bg-muted/60"}`}>{i.name}</button>
            </li>
          ))}
          <li>
            <button type="button" role="option" aria-selected={instId === null} onClick={() => { setIndep(false); setInstId(null); setSchool(""); setDept(""); setLevel(0); }} className={`min-h-[44px] w-full rounded-lg border px-3 text-left text-sm ${instId === null ? "border-brand-600 bg-brand-600/10 font-semibold" : "border-border hover:bg-muted/60"}`}>My school is not listed</button>
          </li>
          <li>
            <button type="button" role="option" aria-selected={indep} onClick={() => { setIndep(true); setInstId(null); setSchool(""); setDept(""); setLevel(0); setUnlisted(false); }} className={`min-h-[44px] w-full rounded-lg border px-3 text-left text-sm ${indep ? "border-brand-500 bg-brand-500/10" : "border-border"}`}>I&apos;m not in a university (secondary school, exam prep, self-study)</button>
          </li>
        </ul>
      </div>

      {indep && (
        <div className="space-y-3">
          <input className={field} placeholder="What are you studying or preparing for? (optional)" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="What are you studying" />
        </div>
      )}

      {instId === null && !indep && (
        <div className="space-y-3">
          <input className={field} placeholder="Your school's name" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Your school's name" />
          <input className={field} placeholder="Your department or course" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Your department or course" />
        </div>
      )}

      {inst && (
        <div className="space-y-3">
          {!inst.verified && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">This list is still being checked with the university. If your department is missing, tell us in Settings after you finish.</p>}
          <select className={field} value={school} onChange={(e) => { setSchool(e.target.value); setDept(""); }} aria-label="Your school or faculty">
            <option value="">Your school or faculty</option>
            {inst.schools.map((s) => <option key={s.id} value={s.name}>{s.short} · {s.name}</option>)}
          </select>
          <select className={field} value={unlisted ? "__other" : dept} onChange={(e) => { if (e.target.value === "__other") { setUnlisted(true); setDept(""); } else { setUnlisted(false); setDept(e.target.value); } }} disabled={!sch} aria-label="Your department">
            <option value="">{sch ? "Your department" : "Pick your school first"}</option>
            {(sch?.departments ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
            {sch && <option value="__other">My department isn&apos;t listed</option>}
          </select>
          {unlisted && <input className={field} placeholder="Type your department" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Type your department" />}
        </div>
      )}

      {(instId !== undefined || indep) && (
        <select className={field} value={level || ""} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Your level">
          <option value="">Your level</option>
          {levels.map((l) => <option key={l} value={l}>{l} level</option>)}
        </select>
      )}

      {withReason && <textarea className={`${field} h-24 py-2`} placeholder="Why does this need to change?" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Why does this need to change?" />}

      <Button className="w-full min-h-[48px]" disabled={!ready || busy} isLoading={busy} onClick={() => onSubmit({ institutionId: indep ? "independent" : inst ? inst.id : null, institution: indep ? INDEPENDENT_NAME : inst ? inst.name : other, ...(unlisted ? { unlisted: true } : {}), school: inst && !indep ? school : "", department: dept, level, ...(withReason ? { reason } : {}) })}>{submitLabel}</Button>
    </div>
  );
}

/** A student who has not set their course sees this once, full screen. It sets which classes they see, so it cannot be skipped. */
export function AcademicGate() {
  const user = useUserStore((s) => s.user);
  const { toast } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const isStudent = !!user && user.role !== "teacher" && user.role !== "admin" && user.profileSetup !== false;

  useEffect(() => {
    if (!isStudent) return;
    let alive = true;
    fetch("/api/profile/academic").then((r) => r.json()).then((j) => alive && j.ok && setInfo({ ...j.data, institutions: asArray(j.data.institutions), levels: asArray(j.data.levels) })).catch(() => null);
    return () => { alive = false; };
  }, [isStudent]);

  if (!isStudent || !info || info.locked || done) return null;

  const submit = async (v: { institutionId: string | null; institution: string; unlisted?: boolean; school: string; department: string; level: number }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/academic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return toast({ title: "Couldn't save that", description: j?.error?.message || "Try again.", variant: "destructive" });
      setDone(true);
      window.location.reload();
    } catch {
      toast({ title: "Network error", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="Choose your school and course">
      <div className="mx-auto max-w-md space-y-5 px-5 py-10">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">One quick step</p>
          <h1 className="text-2xl font-semibold tracking-tight">Where do you study?</h1>
          <p className="text-sm text-muted-foreground">Sunroot shows you the classes for your own school, department and level. Choose carefully: after this it is locked to your account, and only an admin can change it.</p>
        </div>
        <AcademicForm info={info} busy={busy} submitLabel="Save and continue" onSubmit={submit} />
      </div>
    </div>
  );
}

/** Shown in Settings: the locked course, and a request to change it. */
export function AcademicCard() {
  const { toast } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/profile/academic").then((r) => r.json()).then((j) => alive && j.ok && setInfo({ ...j.data, institutions: asArray(j.data.institutions), levels: asArray(j.data.levels) })).catch(() => null);
    return () => { alive = false; };
  }, []);
  if (!info?.academic) return null;
  const a = info.academic;
  const send = async (v: { institutionId: string | null; institution: string; school: string; department: string; level: number; reason?: string }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/academic/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return toast({ title: "Couldn't send that", description: j?.error?.message || "Try again.", variant: "destructive" });
      setSent(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Your school and course">
      <h2 className="text-sm font-semibold">Your school and course</h2>
      <p className="text-sm text-muted-foreground">{a.institution}<br />{a.school ? `${a.school} · ` : ""}{a.department} · {a.level} level</p>
      <p className="text-xs text-muted-foreground">Your level moves up by itself at the start of each academic year. Everything else is locked.</p>
      {info.pendingRequest || sent ? <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Your change request is waiting for an admin.</p> : open ? <AcademicForm info={info} busy={busy} submitLabel="Send change request" withReason onSubmit={send} /> : <Button variant="outline" onClick={() => setOpen(true)}>Request a change</Button>}
    </section>
  );
}
