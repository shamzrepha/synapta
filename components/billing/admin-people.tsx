"use client";

import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchJson, asArray } from "@/lib/api/client";
import { PLANS, plansForRole, type PlanId } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import type { PlanFilter, RoleFilter, SortKey } from "@/lib/billing/people-browse";

interface Person {
  uid: string;
  name: string;
  email: string;
  username: string;
  role: string;
  plan: string;
  planLabel: string;
  paid: boolean;
  planExpiresAt: string | null;
  grantKind: string | null;
  isTester: boolean;
  createdAt?: number;
  xp?: number;
}

const KIND_LABEL: Record<string, string> = { gift: "free subscription", trial: "free trial", test: "test account" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

/** Find anyone by name, username or email, then give them a plan, start a free trial, or turn them into a test account. */
export function AdminPeople() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [busy, setBusy] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [plan, setPlan] = useState<PlanId>("plus");
  const [days, setDays] = useState("30");
  const [trialDays, setTrialDays] = useState("14");
  const [note, setNote] = useState("");
  // browse without typing
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<RoleFilter>("all");
  const [planF, setPlanF] = useState<PlanFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [browse, setBrowse] = useState<{ people: Person[]; total: number; capped: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const j = await fetchJson<{ people: Person[]; total: number; capped: boolean }>(`/api/admin/billing/people?browse=1&role=${role}&plan=${planF}&sort=${sort}`);
      if (!live) return;
      setLoading(false);
      setBrowse(j.ok ? { people: asArray<Person>(j.data.people), total: j.data.total, capped: j.data.capped } : null);
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, role, planF, sort]);

  useEffect(() => {
    if (q.trim().length < 2) {
      const t = setTimeout(() => setResults(null), 0);
      return () => clearTimeout(t);
    }
    let live = true;
    const t = setTimeout(async () => {
      const j = await fetchJson<{ people: Person[] }>(`/api/admin/billing/people?q=${encodeURIComponent(q.trim())}`);
      if (live) setResults(j.ok ? asArray<Person>(j.data.people) : []);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  // the plans that make sense for this person's account type (students get student plans, teachers get both ladders)
  const choices = (person && !showAll ? plansForRole(person.role) : plansForRole("admin")).filter((p) => p.id !== "free");
  const chosen: PlanId = choices.some((p) => p.id === plan) ? plan : (choices[0]?.id as PlanId);

  const act = async (body: Record<string, unknown>, label: string, force = false) => {
    if (!person) return;
    setBusy(label);
    const j = await fetchJson<{ person: Person }>("/api/admin/billing/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, uid: person.uid, ...(force ? { force: true } : {}) }) });
    setBusy("");
    if (j.ok) {
      setPerson(j.data.person);
      setResults((r) => (r ? r.map((x) => (x.uid === j.data.person.uid ? j.data.person : x)) : r));
      toast({ title: "Done", description: `${label} for ${person.name || person.email}.`, variant: "success" });
    } else if (j.error.code === "ROLE_MISMATCH" && window.confirm(`${j.error.message}\\n\\nGive it anyway?`)) {
      await act(body, label, true);
    } else if (j.error.code !== "ROLE_MISMATCH") {
      toast({ title: "Couldn't do that", description: j.error.message, variant: "destructive" });
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="font-bold text-sm">People: plans, free trials and test accounts</p>
        <p className="text-xs text-slate-500">Search by name, username or email, then choose what to do.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or email…" className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent pl-9 pr-3 text-sm" />
      </div>
      <div className="space-y-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline">
          {open ? "Hide the list" : "Or browse everyone with filters"}
        </button>
        {open && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-[11px] text-slate-500">Account type
                <select value={role} onChange={(e) => setRole(e.target.value as RoleFilter)} className="mt-0.5 w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm">
                  <option value="all">Everyone</option>
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                  <option value="admin">Admins</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-500">Plan
                <select value={planF} onChange={(e) => setPlanF(e.target.value as PlanFilter)} className="mt-0.5 w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm">
                  <option value="all">Any plan</option>
                  <option value="free">On the free plan</option>
                  <option value="paid">Paying</option>
                  <option value="gifted">Free subscription</option>
                  <option value="trial">On a free trial</option>
                  <option value="tester">Test accounts</option>
                  <option value="ending">Plan ends within 7 days</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-500">Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="mt-0.5 w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm">
                  <option value="newest">Newest first</option>
                  <option value="name">Name A to Z</option>
                  <option value="ending">Plan ending soonest</option>
                  <option value="xp">Most XP</option>
                  <option value="active">Last active</option>
                </select>
              </label>
            </div>
            {loading && <p className="text-xs text-slate-500">Loading…</p>}
            {browse && !loading && (
              <>
                <p className="text-[11px] text-slate-500">
                  {browse.total} {browse.total === 1 ? "person" : "people"}{browse.total > browse.people.length ? `, showing the first ${browse.people.length}` : ""}
                  {browse.capped ? ". Only the first 1,500 accounts were checked; use the search box to find anyone else." : ""}
                </p>
                {browse.people.length === 0 ? (
                  <p className="text-xs text-slate-500">Nobody matches those filters.</p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                    {browse.people.map((p) => (
                      <li key={p.uid}>
                        <button type="button" onClick={() => setPerson(p)} className={cn("w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-900", person?.uid === p.uid && "bg-teal-500/10")}>
                          <span className="flex-1 min-w-0 truncate"><b>{p.name || "Unnamed"}</b> <span className="text-slate-500">{p.email}</span></span>
                          <span className="capitalize rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5">{p.role}</span>
                          <span className="rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 px-2 py-0.5">{p.planLabel}</span>
                          {p.isTester && <span className="rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5">test</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {results && results.length === 0 && <p className="text-xs text-slate-500">Nobody found.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
          {results.map((p) => (
            <li key={p.uid}>
              <button type="button" onClick={() => setPerson(p)} className={cn("w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-900", person?.uid === p.uid && "bg-teal-500/10")}>
                <span className="flex-1 min-w-0 truncate"><b>{p.name || "Unnamed"}</b> <span className="text-slate-500">{p.email}</span></span>
                <span className="capitalize rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5">{p.role}</span>
                <span className="rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 px-2 py-0.5">{p.planLabel}</span>
                {p.isTester && <span className="rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5">test</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {person && (
        <div className="rounded-2xl border border-teal-500/40 p-3 space-y-4">
          <div className="text-xs space-y-0.5">
            <p className="text-sm font-bold">{person.name || "Unnamed"} <span className="font-normal text-slate-500">{person.email}</span></p>
            <p>
              Account type: <b className="capitalize">{person.role}</b> · Plan: <b>{person.planLabel}</b>
              {person.planExpiresAt && ` until ${day(person.planExpiresAt)}`}
              {person.grantKind && ` (${KIND_LABEL[person.grantKind] || person.grantKind})`}
              {person.isTester && " · test account"}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3">
              <p className="text-xs font-bold">Give a free subscription or start a free trial</p>
              <select value={chosen} onChange={(e) => setPlan(e.target.value as PlanId)} aria-label="Plan" className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm">
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.codename}){p.audience === "teacher" ? " · teacher" : ""}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show every plan, not just the ones for a {person.role} account</label>
              <div className="flex flex-wrap items-center gap-2">
                <input type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days" className="w-20 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm" />
                <span className="text-xs">days</span>
                <Button size="sm" disabled={!!busy} onClick={() => act({ action: "grant", plan: chosen, days: Number(days) || 30, kind: "gift", note }, "Free subscription given")}>Give free subscription</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={trialDays} onChange={(e) => setTrialDays(e.target.value)} aria-label="Trial length" className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-sm">
                  {["3", "7", "14", "30"].map((d) => <option key={d} value={d}>{d}-day trial</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act({ action: "grant", plan: chosen, days: Number(trialDays), kind: "trial", note }, "Free trial started")}>Start free trial</Button>
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Note (optional), e.g. FUTO pilot" className="w-full h-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 text-xs" />
            </div>

            <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3">
              <p className="text-xs font-bold">Use as a test (dummy) account</p>
              <p className="text-[11px] text-slate-500">Removes any plan, clears this month&apos;s usage, and adds the account to the test list, so you can go through the limits, the upgrade pop-up and a real payment as an ordinary free user.</p>
              <div className="flex flex-wrap gap-2">
                {person.isTester ? (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act({ action: "untest" }, "Removed from test accounts")}>Stop using as test account</Button>
                ) : (
                  <Button size="sm" disabled={!!busy} onClick={() => act({ action: "test" }, "Made a test account")}>Make test account</Button>
                )}
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act({ action: "reset" }, "Usage reset")}>Reset this month&apos;s usage</Button>
                <Button size="sm" variant="ghost" disabled={!!busy || !person.paid} onClick={() => act({ action: "remove" }, "Plan removed")}>Remove plan</Button>
              </div>
              <p className="text-[11px] text-slate-500">Limits only apply to a test account while the switch above is on &quot;Test accounts only&quot; or &quot;Everyone&quot;.</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">{PLANS[chosen]?.blurb}</p>
        </div>
      )}
    </Card>
  );
}
