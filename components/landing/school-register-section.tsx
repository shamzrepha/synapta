"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  Copy,
  GraduationCap,
  School,
  ShieldCheck,
  Sparkles,
  Users,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SchoolTier = "primary" | "secondary" | "university" | "polytechnic" | "college" | "academy";

const TIER_CARDS: {
  id: SchoolTier;
  title: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: "primary",
    title: "Primary School",
    badge: "Primary 1 – 6",
    desc: "Interactive read-aloud with Sprout, phonics, numeracy, basic science games, and parent progress reports.",
  },
  {
    id: "secondary",
    title: "Secondary / High School",
    badge: "JSS 1–3 & SS 1–3",
    desc: "Virtual Chemistry & Physics Lab, WAEC/NECO/JAMB CBT simulator, handwritten theory grading, and principal analytics.",
  },
  {
    id: "university",
    title: "University / Tertiary",
    badge: "100L – Postgraduate",
    desc: "Departmental syllabi, past exam banks, 3D circuit & code studio, cognitive twin mastery radar, and Inter-Uni Cup.",
  },
  {
    id: "academy",
    title: "Academy / Self-Study Hub",
    badge: "All Ages & Skills",
    desc: "Tutorial centers, coding bootcamps, vocational institutes, and independent study groups.",
  },
];

interface RegisteredSchoolItem {
  id: string;
  name: string;
  kind: string;
  department: string;
}

export function SchoolRegisterSection() {
  const [kind, setKind] = useState<SchoolTier>("secondary");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [seatLimit, setSeatLimit] = useState(100);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    schoolId: string;
    schoolName: string;
    kind: string;
    inviteCode: string;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [directory, setDirectory] = useState<RegisteredSchoolItem[]>([]);

  useEffect(() => {
    fetch("/api/schools?mode=directory")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.data?.registeredSchools)) {
          setDirectory(j.data.registeredSchools);
        }
      })
      .catch(() => null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 3) {
      setError("Please enter your school or institution name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "public_register_school",
          name: name.trim(),
          kind,
          department: department.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          seatLimit: Math.min(200, Math.max(10, Number(seatLimit) || 100)),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setError(j?.error?.message || "Could not register school right now. Please try again.");
        return;
      }
      setCreated(j.data);
      setDirectory((prev) => [
        { id: j.data.schoolId, name: j.data.schoolName, kind: j.data.kind, department: department.trim() },
        ...prev.filter((x) => x.name.toLowerCase() !== j.data.schoolName.toLowerCase()),
      ]);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-12 items-start">
      {/* Left column: Tier selector + Value prop */}
      <div className="lg:col-span-6 space-y-6">
        <div className="space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400 flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" /> School Self-Registration — Primary, Secondary & University
          </p>
          <h2 className="text-[clamp(1.85rem,3.8vw,3rem)] font-medium leading-[1.06] tracking-[-0.03em]">
            Register your school in 60 seconds.{" "}
            <em className="font-serif font-normal italic text-brand-600 dark:text-brand-400">
              Every tier supported.
            </em>
          </h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Sunroot isn&apos;t only for universities — it is built for Primary Schools, Secondary Schools, Universities, and independent learners. Select your institution category below to register your school, get your official school invite code, and monitor student mastery across every class.
          </p>
        </div>

        {/* 4 Institution Tier Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Select school category">
          {TIER_CARDS.map((t) => {
            const active = kind === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setKind(t.id)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all flex flex-col justify-between gap-2",
                  active
                    ? "border-brand-600 bg-brand-500/10 ring-1 ring-brand-600"
                    : "border-border bg-card hover:border-muted-foreground/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{t.title}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      active ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {t.badge}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Dynamically registered schools on the platform (zero hardcoded schools) */}
        {directory.length > 0 && (
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-brand-500" /> Registered Schools on Sunroot ({directory.length})
              </p>
              <Link href="/schools" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                Open School Portal →
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {directory.slice(0, 18).map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium"
                >
                  <School className="h-3 w-3 text-brand-500" />
                  <span>{s.name}</span>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">({s.kind})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right column: Instant Self-Registration Card */}
      <div className="lg:col-span-6">
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-soft space-y-5">
          {created ? (
            <div className="space-y-4 py-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> School Portal Registered & 14-Day Pilot Active
              </div>
              <h3 className="text-xl font-bold tracking-tight">{created.schoolName}</h3>
              <p className="text-sm text-muted-foreground">{created.message}</p>

              <div className="rounded-xl border-2 border-brand-500/40 bg-brand-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Official School Invite Code
                  </p>
                  <p className="text-xl font-mono font-extrabold text-brand-600 dark:text-brand-400">
                    {created.inviteCode}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyCode(created.inviteCode)}
                  className="text-xs font-semibold"
                >
                  {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy Code"}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/signup"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-xs font-bold text-white hover:bg-brand-700"
                >
                  Open Principal & Teacher Dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreated(null);
                    setName("");
                  }}
                  className="text-xs"
                >
                  Register another school
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    Register Your School Account
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Instant school portal, student invite code, and cross-class progress tracking.
                  </p>
                </div>
                <span className="rounded-full bg-brand-500/10 border border-brand-500/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-brand-700 dark:text-brand-300 font-semibold">
                  14-Day Free School Pilot
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    School / Institution Name *
                  </label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      kind === "primary"
                        ? "e.g. Corona Primary School"
                        : kind === "secondary"
                        ? "e.g. Federal Government College"
                        : kind === "university"
                        ? "e.g. State University of Science & Tech"
                        : "e.g. BrightMinds STEM Academy"
                    }
                    className="h-10 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    School Category *
                  </label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as SchoolTier)}
                    aria-label="School Category"
                    className="w-full h-10 px-2.5 text-xs rounded-lg border border-border bg-background text-foreground"
                  >
                    <option value="primary">Primary School</option>
                    <option value="secondary">Secondary School</option>
                    <option value="university">University</option>
                    <option value="polytechnic">Polytechnic</option>
                    <option value="college">College</option>
                    <option value="academy">Academy / Hub</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Class Arm / Faculty / Stream (Optional)
                  </label>
                  <Input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder={
                      kind === "primary"
                        ? "e.g. Primary 1–6"
                        : kind === "secondary"
                        ? "e.g. JSS 1–SS 3 Science & Arts"
                        : "e.g. Faculty of Engineering"
                    }
                    className="h-10 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Estimated Student Seats
                  </label>
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    value={seatLimit}
                    onChange={(e) => setSeatLimit(Math.min(200, Math.max(10, Number(e.target.value) || 100)))}
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Principal / Admin Name *
                  </label>
                  <Input
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Mrs. Adebayo / Dr. Musa"
                    className="h-10 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Official Email *
                  </label>
                  <Input
                    required
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="admin@yourschool.edu"
                    className="h-10 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Phone / WhatsApp
                  </label>
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+234 800 000 0000"
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-muted-foreground">
                  Already have a school invite code?{" "}
                  <Link href="/schools" className="font-semibold text-brand-600 dark:text-brand-400 underline">
                    Join in the School Portal
                  </Link>
                </p>
                <Button
                  type="submit"
                  isLoading={submitting}
                  className="bg-brand-500 hover:bg-brand-400 text-slate-950 font-semibold text-xs h-10 px-5"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Register School & Get Code
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
