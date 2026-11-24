"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Building2, School, X, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fetchJson } from "@/lib/api/client";
import { FEATURES, FEATURE_LABEL, termSavingsPercent, type FeatureKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

interface WirePlan {
  id: string;
  audience: "student" | "teacher" | "school";
  label: string;
  codename: string;
  blurb: string;
  badge?: string;
  priceMonthNgn: number;
  priceTermNgn: number;
  perSeatTermNgn?: number;
  monthlyTokens: number;
  perMinute: number;
  perks: string[];
  limits: Record<FeatureKey, number | null>;
}
interface Me {
  period: string;
  enforced: boolean;
  paymentsReady: boolean;
  plan: WirePlan;
  planExpiresAt: string | null;
  usage: Record<FeatureKey, number>;
  tokens: { used: number; limit: number };
  plans: WirePlan[];
  isAdmin: boolean;
  role: string;
  grant: { kind: string; note: string } | null;
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const GRANT_LABEL: Record<string, string> = { gift: "a free subscription from the Sunroot team", trial: "a free trial", test: "a test account" };
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const compact = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}k` : String(n));

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold">{sentence(label)}</span>
        <span className="font-mono text-slate-500">{limit === null ? `${used} (no cap)` : limit === 0 ? "not included" : `${used} / ${limit}`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The rows of the comparison table, grouped the way subscription pages usually are. */
const MATRIX: Array<{ group: string; rows: Array<{ label: string; get: (p: WirePlan) => string }> }> = [
  {
    group: "Study tools",
    rows: FEATURES.filter((f) => ["notes", "scan_pages", "lessons", "practice"].includes(f)).map((f) => ({ label: FEATURE_LABEL[f].many, get: (p: WirePlan) => (p.limits[f] === null ? "Unlimited" : p.limits[f] === 0 ? "Not included" : String(p.limits[f])) })),
  },
  {
    group: "Build and teach",
    rows: FEATURES.filter((f) => ["studio_ai", "class_build"].includes(f)).map((f) => ({ label: FEATURE_LABEL[f].many, get: (p: WirePlan) => (p.limits[f] === null ? "Unlimited" : p.limits[f] === 0 ? "—" : String(p.limits[f])) })),
  },
  {
    group: "AI power",
    rows: [
      { label: "AI tutor and everything else (tokens a month)", get: (p) => compact(p.monthlyTokens) },
      { label: "AI speed (requests a minute)", get: (p) => String(p.perMinute) },
    ],
  },
];

export default function PlansPage() {
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState("");
  const [term, setTerm] = useState<"month" | "term">("term");
  const [tab, setTab] = useState<"student" | "teacher" | null>(null);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [inqInstitution, setInqInstitution] = useState("");
  const [inqDepartment, setInqDepartment] = useState("");
  const [inqRole, setInqRole] = useState<"hod_dean" | "lecturer" | "school_admin" | "class_rep">("hod_dean");
  const [inqSeats, setInqSeats] = useState(150);
  const [inqName, setInqName] = useState("");
  const [inqEmail, setInqEmail] = useState("");
  const [inqPhone, setInqPhone] = useState("");
  const [inqNotes, setInqNotes] = useState("");
  const [submittingInquiry, setSubmittingInquiry] = useState(false);

  const load = useCallback(async () => {
    const j = await fetchJson<Me>("/api/billing/me");
    if (j.ok) setMe(j.data);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    // coming back from Paystack: ask Paystack straight away whether the payment went through, so the plan shows at once
    const q = new URLSearchParams(window.location.search);
    const reference = q.get("reference") || q.get("trxref");
    if (q.get("paid") === "1" && reference) {
      fetchJson<{ paid: boolean; plan?: string }>(`/api/billing/verify?reference=${encodeURIComponent(reference)}`).then((j) => {
        if (j.ok && j.data.paid) toast({ title: "Payment received", description: "Your plan is active. Thank you!", variant: "success" });
        else toast({ title: "Checking your payment…", description: "If it doesn't show in a minute, contact us with your payment reference.", variant: "amber" });
        void load();
      });
    }
    return () => clearTimeout(t);
  }, [load, toast]);

  /** Confirms a payment straight away; the signed webhook is still what activates the plan. */
  const confirm = async (reference: string) => {
    const j = await fetchJson<{ paid: boolean }>(`/api/billing/verify?reference=${encodeURIComponent(reference)}`);
    if (j.ok && j.data.paid) toast({ title: "Payment received", description: "Your plan is active. Thank you!", variant: "success" });
    else toast({ title: "Checking your payment…", description: "If it doesn't show in a minute, contact us with your payment reference.", variant: "amber" });
    void load();
  };

  const buy = async (plan: string, period: "month" | "term") => {
    setBusy(`${plan}-${period}`);
    const j = await fetchJson<{ url: string; accessCode?: string }>("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, term: period }) });
    if (!j.ok) {
      setBusy("");
      toast({ title: "Couldn't start the payment", description: j.error.message, variant: "destructive" });
      return;
    }
    // pay in a window on this page; if the window can't open, fall back to the full payment page
    try {
      const w = window as unknown as { PaystackPop?: new () => { resumeTransaction: (code: string, cb: { onSuccess: (t: { reference: string }) => void; onCancel: () => void }) => void } };
      if (!w.PaystackPop) {
        await new Promise<void>((resolve, reject) => {
          const el = document.createElement("script");
          el.src = "https://js.paystack.co/v2/inline.js";
          el.onload = () => resolve();
          el.onerror = () => reject(new Error("load"));
          document.head.appendChild(el);
        });
      }
      if (!w.PaystackPop || !j.data.accessCode) throw new Error("unavailable");
      new w.PaystackPop().resumeTransaction(j.data.accessCode, {
        onSuccess: (t) => void confirm(t.reference),
        onCancel: () => setBusy(""),
      });
      setBusy("");
    } catch {
      window.location.assign(j.data.url);
    }
  };

  const submitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inqInstitution.trim() || !inqDepartment.trim() || !inqName.trim() || !inqEmail.trim() || !inqPhone.trim()) {
      toast({ title: "Missing details", description: "Please complete all required institutional fields.", variant: "destructive" });
      return;
    }
    setSubmittingInquiry(true);
    try {
      const j = await fetchJson<{ id: string; estimatedSemesterNgn: number; message: string }>("/api/institutions/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution: inqInstitution.trim(),
          department: inqDepartment.trim(),
          contactRole: inqRole,
          estimatedStudents: Math.max(10, Number(inqSeats) || 100),
          contactName: inqName.trim(),
          contactEmail: inqEmail.trim(),
          contactPhone: inqPhone.trim(),
          notes: inqNotes.trim(),
        }),
      });
      if (!j.ok) {
        toast({ title: "Could not submit request", description: j.error.message, variant: "destructive" });
        return;
      }
      toast({
        title: "Departmental Quote & Pilot Requested!",
        description: `Estimated invoice: ${naira(j.data.estimatedSemesterNgn)}/semester. Our university partnerships team will reach out shortly.`,
        variant: "success",
      });
      setShowInquiryModal(false);
    } finally {
      setSubmittingInquiry(false);
    }
  };

  if (!me) return <Skeleton className="h-96 rounded-2xl" />;
  const paid = me.plan.id !== "free" && !!me.planExpiresAt;
  const teaching = me.plans.some((p) => p.audience === "teacher");
  const audience = tab ?? (me.role === "teacher" ? "teacher" : "student");
  const shown = me.plans.filter((p) => (audience === "teacher" ? p.audience !== "student" : p.audience === "student"));
  const topSaving = Math.max(0, ...shown.map((p) => termSavingsPercent(p)));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono tracking-widest text-brand-600">PLANS & USAGE</p>
        <h1 className="text-2xl font-extrabold">You&apos;re on {me.plan.label} <span className="text-base font-semibold text-slate-400">{me.plan.codename}</span></h1>
        <p className="text-sm text-slate-500">
          {paid ? `Active until ${new Date(me.planExpiresAt!).toLocaleDateString()}${me.grant ? `, ${GRANT_LABEL[me.grant.kind] || ""}` : ""}.` : "Everything your teachers publish is free. Your own AI use has a monthly allowance."}
          {!me.enforced && " Limits are shown for planning; nothing is blocked yet."}
          {me.isAdmin && (
            <>
              {" "}
              <Link href="/admin/billing" className="font-semibold text-brand-700 dark:text-brand-300 underline">Admin: payments, people and the limits switch →</Link>
            </>
          )}
        </p>
      </div>

      <Card className="p-4 md:p-5 space-y-3">
        <p className="font-bold text-sm">This month ({me.period})</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.filter((f) => me.plan.limits[f] !== 0 || me.usage[f] > 0).map((f) => (
            <Meter key={f} label={FEATURE_LABEL[f].many} used={me.usage[f]} limit={me.plan.limits[f]} />
          ))}
          <Meter label="AI tutor and everything else (tokens)" used={me.tokens.used} limit={me.tokens.limit} />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {teaching && (
          <div className="inline-flex rounded-full border border-slate-300 dark:border-slate-700 p-1" role="tablist" aria-label="Who the plans are for">
            {(["student", "teacher"] as const).map((a) => (
              <button key={a} type="button" role="tab" aria-selected={audience === a} onClick={() => setTab(a)} className={cn("rounded-full px-4 py-1.5 text-xs font-bold", audience === a ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300")}>
                {a === "student" ? "For students" : "For teachers"}
              </button>
            ))}
          </div>
        )}
        <div className="inline-flex rounded-full border border-slate-300 dark:border-slate-700 p-1" role="group" aria-label="Billing period">
          {(["month", "term"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={term === t} onClick={() => setTerm(t)} className={cn("rounded-full px-4 py-1.5 text-xs font-bold", term === t ? "bg-brand-600 text-white" : "text-slate-600 dark:text-slate-300")}>
              {t === "month" ? "Monthly" : "Semester (4.5 months)"}
            </button>
          ))}
        </div>
        {term === "term" && topSaving > 0 && <span className="text-xs font-semibold text-emerald-600">Pay once for the semester and save up to {topSaving}%</span>}
      </div>

      <div className={cn("grid gap-4 md:grid-cols-2", shown.length >= 5 ? "xl:grid-cols-5" : shown.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
        {shown.map((p) => {
          const current = p.id === me.plan.id;
          const buyable = p.audience !== "school" && p.priceMonthNgn > 0;
          return (
            <Card key={p.id} className={cn("relative p-4 space-y-3 flex flex-col", current && "border-brand-500 ring-1 ring-brand-500", p.badge && !current && "border-amber-500/60")}>
              {p.badge && <span className="absolute -top-2.5 right-3 rounded-full bg-[#F28C28] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#12241C]">{p.badge}</span>}
              <div>
                <p className="font-extrabold text-lg leading-tight">{p.label}</p>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">{p.codename}</p>
                <p className="text-xs text-slate-500 mt-1">{p.blurb}</p>
              </div>
              {p.id === "free" ? (
                <p className="flex flex-wrap items-baseline gap-x-1 text-2xl font-extrabold">₦0<span className="whitespace-nowrap text-xs font-normal text-slate-500">/ month</span></p>
              ) : p.audience === "school" ? (
                <div>
                  <p className="flex flex-wrap items-baseline gap-x-1 text-2xl font-extrabold">{naira(p.perSeatTermNgn ?? 1200)}<span className="whitespace-nowrap text-xs font-normal text-slate-500">/ student / semester</span></p>
                  <p className="text-xs text-slate-500">Custom price for a whole department</p>
                </div>
              ) : (
                <div>
                  <p className="flex flex-wrap items-baseline gap-x-1 text-2xl font-extrabold">
                    {naira(term === "month" ? p.priceMonthNgn : p.priceTermNgn)}
                    <span className="whitespace-nowrap text-xs font-normal text-slate-500">/ {term === "month" ? "month" : "semester"}</span>
                  </p>
                  <p className="text-xs text-emerald-600 min-h-4">{term === "term" ? `Save ${termSavingsPercent(p)}% against paying monthly` : `or ${naira(p.priceTermNgn)} for a semester`}</p>
                </div>
              )}
              <ul className="space-y-1.5 text-xs flex-1">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex gap-1.5"><Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-600" /> {perk}</li>
                ))}
              </ul>
              {current ? (
                <p className="text-xs font-bold text-brand-700 dark:text-brand-300">Your current plan</p>
              ) : me.role === "admin" ? (
                <p className="text-xs text-slate-500">Admin accounts are never limited. Give someone this plan from <Link href="/admin/billing" className="underline">Payments &amp; plans</Link>.</p>
              ) : buyable ? (
                me.paymentsReady ? (
                  <Button size="sm" disabled={!!busy} onClick={() => buy(p.id, term)}>
                    {busy === `${p.id}-${term}` ? <Loader2 className="h-4 w-4 animate-spin" /> : `Upgrade to ${p.label}`}
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">Online payment opens soon.</p>
                )
              ) : p.audience === "school" ? (
                <Button size="sm" variant="outline" onClick={() => setShowInquiryModal(true)} className="w-full text-xs font-semibold">
                  <Building2 className="mr-1.5 h-3.5 w-3.5 text-brand-600" /> Request Departmental Quote
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card className="p-4 overflow-x-auto">
        <p className="font-bold text-sm mb-2">Compare plans</p>
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-left">
              <th className="py-2 pr-3 font-semibold text-slate-500">Per month</th>
              {shown.map((p) => (
                <th key={p.id} className={cn("py-2 px-2 text-center font-bold", p.id === me.plan.id && "text-brand-700 dark:text-brand-300")}>{p.label}</th>
              ))}
            </tr>
          </thead>
          {MATRIX.map((g) => (
            <tbody key={g.group}>
              <tr><td colSpan={shown.length + 1} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.group}</td></tr>
              {g.rows.filter((r) => shown.some((p) => r.get(p) !== "—")).map((r) => (
                <tr key={r.label} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-1.5 pr-3">{sentence(r.label)}</td>
                  {shown.map((p) => (
                    <td key={p.id} className="py-1.5 px-2 text-center font-mono">{r.get(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p className="text-[11px] text-slate-500 mt-2">Unlimited means fair use, within the AI budget shown. Class lessons, podcasts, quizzes and simulations your teachers publish are free on every plan.</p>
      </Card>

      {/* B2B University, Faculty & Departmental Licensing Banner */}
      <Card className="p-4 sm:p-5 border-2 border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-card to-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1">
              <School className="h-3 w-3" /> For Universities, Faculties & Student Unions
            </span>
          </div>
          <h2 className="text-base font-extrabold text-foreground">
            Onboard your entire Department or Faculty at ₦1,200 / student / semester
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Every lecturer in your department gets Studio Plan tools (AI syllabus builder, CBT exam bank, handwritten script grader, 3D labs), and every student gets full Plus Semester access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link href="/schools">
            <Button type="button" size="sm" variant="outline" className="text-xs font-semibold">
              <School className="mr-1.5 h-4 w-4 text-brand-600" /> Open School & Principal Portal
            </Button>
          </Link>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowInquiryModal(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
          >
            <Building2 className="mr-1.5 h-4 w-4" /> Request Departmental Pilot / Invoice
          </Button>
        </div>
      </Card>

      {/* Institutional Quote & Pilot Modal */}
      {showInquiryModal && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="b2b-inquiry-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-2xl space-y-4 relative max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setShowInquiryModal(false)}
              aria-label="Close modal"
              className="absolute right-3 top-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1 pr-6">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-600 text-white inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> University & School Licensing
              </span>
              <h3 id="b2b-inquiry-title" className="text-base sm:text-lg font-extrabold text-foreground">
                Request Departmental Pilot or Semester Invoice
              </h3>
              <p className="text-xs text-muted-foreground">
                Instant NUC/Pan-African curriculum alignment, CBT exam banks, and Plus access for your students.
              </p>
            </div>

            <form onSubmit={submitInquiry} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    University / Institution *
                  </label>
                  <Input
                    required
                    placeholder="e.g. UNILAG, FUTO, Univ. of Ghana"
                    value={inqInstitution}
                    onChange={(e) => setInqInstitution(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Department / Faculty *
                  </label>
                  <Input
                    required
                    placeholder="e.g. Faculty of Engineering"
                    value={inqDepartment}
                    onChange={(e) => setInqDepartment(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Your Role</label>
                  <select
                    value={inqRole}
                    onChange={(e) =>
                      setInqRole(e.target.value as "hod_dean" | "lecturer" | "school_admin" | "class_rep")
                    }
                    className="w-full h-9 px-2.5 text-xs rounded-lg border border-border bg-card text-foreground"
                  >
                    <option value="hod_dean">Dean / Head of Department (HOD)</option>
                    <option value="lecturer">Course Lecturer / Professor</option>
                    <option value="school_admin">School / ICT Administrator</option>
                    <option value="class_rep">Student Union / Class Rep</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Estimated Student Seats
                  </label>
                  <Input
                    type="number"
                    min={10}
                    max={50000}
                    value={inqSeats}
                    onChange={(e) => setInqSeats(Math.max(10, Number(e.target.value) || 10))}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  Estimated Semester License ({Math.max(10, Number(inqSeats) || 10)} seats × ₦1,200):
                </span>
                <span className="text-sm font-extrabold text-brand-700 dark:text-brand-300">
                  {naira(Math.max(10, Number(inqSeats) || 10) * 1200)} / semester
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Contact Name *</label>
                  <Input
                    required
                    placeholder="Dr. / Prof. / Rep Name"
                    value={inqName}
                    onChange={(e) => setInqName(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Official Email *</label>
                  <Input
                    type="email"
                    required
                    placeholder="name@university.edu"
                    value={inqEmail}
                    onChange={(e) => setInqEmail(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Phone / WhatsApp *</label>
                  <Input
                    required
                    placeholder="+234 800 000 0000"
                    value={inqPhone}
                    onChange={(e) => setInqPhone(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Target Courses or Pilot Notes (optional)
                </label>
                <Input
                  placeholder="e.g. 200L & 300L CBT Past Questions + 3D Circuit Labs"
                  value={inqNotes}
                  onChange={(e) => setInqNotes(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowInquiryModal(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={submittingInquiry}
                  className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
                >
                  Submit Departmental Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
